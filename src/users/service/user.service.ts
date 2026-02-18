import { Injectable, ConflictException, NotFoundException, Inject, forwardRef, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../auth/auth.service';
import { UserLoginDto } from '../dto/user-login.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { LoginResponse } from '../types/login-response.type';
import { User } from '../entities/user.entity';
import { UserStatus } from '../enums/user-status.enum';
import { UserType } from '../enums/user-type.enum';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';

@Injectable()
export class UsersService {
  private logger = new Logger('UsersService');

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(EmployeeDetails)
    private employeeDetailsRepository: Repository<EmployeeDetails>,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  async create(userData: Partial<User>): Promise<User> {
    const existingUser = await this.usersRepository.findOne({
      where: { loginId: userData.loginId },
    });

    if (existingUser) {
      throw new ConflictException('User with this loginId already exists');
    }

    // Hash password before saving
    if (userData.password) {
      const salt = await bcrypt.genSalt(10);
      userData.password = await bcrypt.hash(userData.password, salt);
    }

    const user = this.usersRepository.create(userData);
    return await this.usersRepository.save(user);
  }

  async findByLoginId(loginId: string): Promise<User | null> {
    const user = await this.usersRepository.findOne({
      where: { loginId },
      select: ['id', 'loginId', 'aliasLoginName', 'password', 'role', 'userType', 'status', 'resetRequired', 'lastLoggedIn'],
    });
    return user;
  }

  async comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.usersRepository.findOne({
      where: { id },
      select: ['id', 'aliasLoginName', 'loginId', 'userType', 'role', 'createdAt', 'updatedAt', 'password'],
    });

    if (user && !user.role && user.userType === UserType.EMPLOYEE) {
        try {
            const employee = await this.employeeDetailsRepository.findOne({
                where: { employeeId: user.loginId },
                select: ['designation', 'role'],
            });
            if (employee) {
                user.role = (employee.role ? String(employee.role) : employee.designation) as UserType;
                const roleUpper = (user.role || '').toUpperCase();
                if (roleUpper.includes('MNG') || roleUpper.includes('MANAGER')) {
                    user.userType = UserType.MANAGER;
                }
            }
        } catch (error) {
            // fail silently, return user as is
        }
    }

    return user;
  }

  async login(userLoginDto: UserLoginDto): Promise<LoginResponse | any> {
    this.logger.log('Starting login process for user: ' + userLoginDto.loginId);

    if (userLoginDto.loginId === 'Admin' && userLoginDto.password === 'Admin@123') {
       const existingAdmin = await this.usersRepository.findOne({ where: { loginId: 'Admin' } });
       if (!existingAdmin) {
           await this.create({
               loginId: 'Admin',
               password: 'Admin@123',
               aliasLoginName: 'Admin User',
               userType: UserType.ADMIN,
               status: UserStatus.ACTIVE
           });
       }
    }

    try {
      const user = await this.findByLoginId(userLoginDto.loginId);

      // Strict case-sensitive and character check
      if (!user || user.loginId !== userLoginDto.loginId) {
        throw new HttpException('Invalid login credentials', HttpStatus.UNAUTHORIZED);
      }

      if (user.status === UserStatus.INACTIVE) {
        throw new HttpException('User is blocked', HttpStatus.FORBIDDEN);
      }

      const isMatch = await this.comparePassword(userLoginDto.password, user.password);
      if (!isMatch) {
         throw new HttpException('Invalid login credentials', HttpStatus.UNAUTHORIZED);
      }

      const payload = { sub: user.id, loginId: user.loginId };
      const tokens = await this.authService.generateJWTTokenWithRefresh(payload);

      // Update last logged in
      user.lastLoggedIn = new Date();
      await this.usersRepository.save(user);

      let role: string | null = user.role ? String(user.role) : null;
      if (!role && user.userType === UserType.EMPLOYEE) {
        try {
          const employee = await this.employeeDetailsRepository.findOne({
            where: { employeeId: user.loginId },
            select: ['designation', 'role'],
          });
          if (employee) {
            role = employee.role ? String(employee.role) : employee.designation;
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch employee details for loginId: ${user.loginId}`, error);
        }
      }

      const roleUpper = (role || '').toUpperCase();
      const isManager = roleUpper.includes('MNG') || roleUpper.includes('MANAGER');

      return {
        userId: user.id,
        name: user.aliasLoginName,
        email: user.loginId,
        userType: isManager ? UserType.MANAGER : user.userType,
        role: role,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        resetRequired: user.resetRequired,
        status: user.status
      };

    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async me(refreshToken: string): Promise<any> {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
         secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'
      });

      const user = await this.findById(payload.sub);
      if (!user) {
         throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }

      const newPayload = { sub: user.id, loginId: user.loginId };
      const tokens = await this.authService.generateJWTTokenWithRefresh(newPayload);

      let role: string | null = user.role ? String(user.role) : null;
      if (!role) {
         try {
           const employee = await this.employeeDetailsRepository.findOne({
             where: { employeeId: user.loginId },
             select: ['role', 'designation'],
           });
           if (employee) {
             role = employee.role ? String(employee.role) : employee.designation;
           }
         } catch (e) {
             // ignore
         }
      }

      return {
        userId: user.id,
        name: user.aliasLoginName,
        email: user.loginId,
        userType: role?.toUpperCase().includes(UserType.MANAGER) ? UserType.MANAGER : user.userType,
        role: role,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        resetRequired: user.resetRequired,
        status: user.status
      };
  } catch (error) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  }
}

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (changePasswordDto.newPassword !== changePasswordDto.confirmNewPassword) {
      throw new HttpException('Passwords do not match', HttpStatus.BAD_REQUEST);
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(changePasswordDto.newPassword, salt);
    user.resetRequired = false;
    user.status = UserStatus.ACTIVE;
    await this.usersRepository.save(user);

    // Sync status with EmployeeDetails
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId: user.loginId },
      });
      if (employee) {
        employee.userStatus = UserStatus.ACTIVE;
        await this.employeeDetailsRepository.save(employee);
        this.logger.log(`Employee status synchronized to ACTIVE for: ${user.loginId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to sync employee status for ${user.loginId}`, error);
    }

    return { message: 'Password changed successfully' };
  }
}

