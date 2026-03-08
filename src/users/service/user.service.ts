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
  ) { }

  async create(userData: Partial<User>): Promise<User> {
    this.logger.log(`Starting creation of new user record: ${userData.loginId}`);
    try {
      const existingUser = await this.usersRepository.findOne({
        where: { loginId: userData.loginId },
      });

      if (existingUser) {
        this.logger.warn(`User creation failed: loginId ${userData.loginId} already exists`);
        throw new ConflictException('User with this loginId already exists');
      }

      // Hash password before saving
      if (userData.password) {
        const salt = await bcrypt.genSalt(10);
        userData.password = await bcrypt.hash(userData.password, salt);
      }

      const user = this.usersRepository.create(userData);
      const saved = await this.usersRepository.save(user);
      this.logger.log(`Successfully created user record ID: ${saved.id} for loginId: ${userData.loginId}`);
      return saved;
    } catch (error) {
      this.logger.error(`Error creating user record for ${userData.loginId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to create user record: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findByLoginId(loginId: string): Promise<User | null> {
    this.logger.log(`Searching for user by loginId: ${loginId}`);
    try {
      return await this.usersRepository.findOne({
        where: { loginId },
        select: ['id', 'loginId', 'aliasLoginName', 'password', 'role', 'userType', 'status', 'resetRequired', 'lastLoggedIn'],
      });
    } catch (error) {
      this.logger.error(`Error searching for user by loginId ${loginId}: ${error.message}`, error.stack);
      throw new HttpException(`Error fetching user data: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      this.logger.error(`Error comparing passwords: ${error.message}`);
      return false;
    }
  }

  async findById(id: string): Promise<User | null> {
    this.logger.log(`Searching for user by ID: ${id}`);
    try {
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
            if (roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER)) {
              user.userType = UserType.MANAGER;
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to enrich user ${id} with employee details: ${error.message}`);
          // fail silently, return user as is
        }
      }

      return user;
    } catch (error) {
      this.logger.error(`Error fetching user by ID ${id}: ${error.message}`, error.stack);
      throw new HttpException(`Error fetching user data: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async login(userLoginDto: UserLoginDto): Promise<LoginResponse | any> {
    this.logger.log(`Login attempt for: ${userLoginDto.loginId}`);

    // Auto-create Admin if matching fixed credentials (bootstrap logic)
    if (userLoginDto.loginId === 'Admin' && userLoginDto.password === 'Admin@123') {
      try {
        const existingAdmin = await this.usersRepository.findOne({ where: { loginId: 'Admin' } });
        if (!existingAdmin) {
          this.logger.log('Bootstrapping default Admin user');
          await this.create({
            loginId: 'Admin',
            password: 'Admin@123',
            aliasLoginName: 'Admin User',
            userType: UserType.ADMIN,
            status: UserStatus.ACTIVE,
            resetRequired: true,
          });
        }
      } catch (err) {
        this.logger.error(`Failed to bootstrap Admin: ${err.message}`);
      }
    }

    // Auto-create Receptionist if matching fixed credentials (view-only role; first login = reset password like Admin)
    if (userLoginDto.loginId === 'Inventech' && userLoginDto.password === 'Invent123') {
      try {
        const existingReceptionist = await this.usersRepository.findOne({ where: { loginId: 'Inventech' } });
        if (!existingReceptionist) {
          this.logger.log('Bootstrapping default Receptionist user (Inventech)');
          await this.create({
            loginId: 'Inventech',
            password: 'Invent123',
            aliasLoginName: 'Receptionist',
            userType: UserType.RECEPTIONIST,
            status: UserStatus.ACTIVE,
            resetRequired: true,
          });
        }
      } catch (err) {
        this.logger.error(`Failed to bootstrap Receptionist: ${err.message}`);
      }
    }

    try {
      const user = await this.findByLoginId(userLoginDto.loginId);

      // Strict case-sensitive and character check
      if (!user || user.loginId !== userLoginDto.loginId) {
        this.logger.warn(`Login failed: Invalid credentials for ${userLoginDto.loginId}`);
        throw new HttpException('Invalid login credentials', HttpStatus.UNAUTHORIZED);
      }

      if (user.status === UserStatus.INACTIVE) {
        this.logger.warn(`Login failed: User ${userLoginDto.loginId} is blocked`);
        throw new HttpException('User is blocked', HttpStatus.FORBIDDEN);
      }

      const isMatch = await this.comparePassword(userLoginDto.password, user.password);
      if (!isMatch) {
        this.logger.warn(`Login failed: Password mismatch for ${userLoginDto.loginId}`);
        throw new HttpException('Invalid login credentials', HttpStatus.UNAUTHORIZED);
      }

      const payload = { sub: user.id, loginId: user.loginId };
      const tokens = await this.authService.generateJWTTokenWithRefresh(payload);

      // Update last logged in
      user.lastLoggedIn = new Date();
      await this.usersRepository.save(user);

      let role: string | null = user.role ? String(user.role) : null;
      let employeeIdStr: string | null = null;
      
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: [
            { employeeId: user.loginId },
            { email: user.loginId }
          ],
          select: ['employeeId', 'designation', 'role'],
        });
        if (employee) {
          employeeIdStr = employee.employeeId;
          if (!role) role = employee.role ? String(employee.role) : employee.designation;
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch employee details for login enrichment: ${user.loginId}`, error);
      }

      const roleUpper = (role || '').toUpperCase();
      const isManager = roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER);

      this.logger.log(`User ${userLoginDto.loginId} logged in successfully with employeeId: ${employeeIdStr}`);

      return {
        userId: user.id,
        name: user.aliasLoginName,
        email: user.loginId,
        userType: isManager ? UserType.MANAGER : user.userType,
        role: role,
        employeeId: employeeIdStr,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        resetRequired: user.resetRequired,
        status: user.status
      };

    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Login error for ${userLoginDto.loginId}: ${error.message}`, error.stack);
      throw new HttpException('An error occurred during login', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async me(refreshToken: string): Promise<any> {
    this.logger.log('Processing refresh token request (/me)');
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'
      });

      const user = await this.findById(payload.sub);
      if (!user) {
        this.logger.warn(`Refresh failed: User for token sub ${payload.sub} not found`);
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }

      const newPayload = { sub: user.id, loginId: user.loginId };
      const tokens = await this.authService.generateJWTTokenWithRefresh(newPayload);

      let role: string | null = user.role ? String(user.role) : null;
      let employeeIdStr: string | null = null;
      
      try {
        const employee = await this.employeeDetailsRepository.findOne({
          where: [
            { employeeId: user.loginId },
            { email: user.loginId }
          ],
          select: ['employeeId', 'role', 'designation'],
        });
        if (employee) {
          employeeIdStr = employee.employeeId;
          if (!role) role = employee.role ? String(employee.role) : employee.designation;
        }
      } catch (e) {
        // ignore
      }

      return {
        userId: user.id,
        name: user.aliasLoginName,
        email: user.loginId,
        userType: role?.toUpperCase().includes(UserType.MANAGER) ? UserType.MANAGER : user.userType,
        role: role,
        employeeId: employeeIdStr,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        resetRequired: user.resetRequired,
        status: user.status
      };
    } catch (error) {
      this.logger.warn(`Refresh failed: Token invalid or expired: ${error.message}`);
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    this.logger.log(`Processing password change for user record: ${userId}`);
    try {
      const user = await this.findById(userId);
      if (!user) {
        this.logger.warn(`Password change failed: User ${userId} not found`);
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
          this.logger.log(`Employee details status synchronized to ACTIVE for: ${user.loginId}`);
        }
      } catch (error) {
        this.logger.error(`Failed to sync employee status for ${user.loginId}: ${error.message}`);
      }

      this.logger.log(`Password changed successfully for user: ${user.loginId}`);
      return { message: 'Password changed successfully' };
    } catch (error) {
      this.logger.error(`Error in changePassword for user ${userId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Failed to change password: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

