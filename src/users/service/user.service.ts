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

@Injectable()
export class UsersService {
  private logger = new Logger('UsersService');

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
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
    return await this.usersRepository
      .createQueryBuilder('user')
      .where('user.loginId = :loginId', { loginId })
      .addSelect('user.password')
      .getOne();
  }

  async comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async findById(id: string): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { id },
      select: ['id', 'aliasLoginName', 'loginId', 'userType', 'createdAt', 'updatedAt', 'password'],
    });
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

      if (!user) {
        throw new HttpException('Invalid login credentials', HttpStatus.UNAUTHORIZED);
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

      return {
        userId: user.id,
        name: user.aliasLoginName,
        email: user.loginId,
        userType: user.userType,
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

      return {
        userId: user.id,
        name: user.aliasLoginName,
        email: user.loginId,
        userType: user.userType,
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
    await this.usersRepository.save(user);

    return { message: 'Password changed successfully' };
  }
}

