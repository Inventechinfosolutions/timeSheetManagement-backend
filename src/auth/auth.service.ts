import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Inject,
  forwardRef,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/service/user.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    private jwtService: JwtService,
  ) { }

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    this.logger.log(`Starting user registration for email: ${registerDto.email}`);
    try {
      const user = await this.usersService.create({
        aliasLoginName: registerDto.name,
        loginId: registerDto.email,
        password: registerDto.password,
      });

      const payload = { sub: user.id, loginId: user.loginId };
      const { accessToken, refreshToken } = await this.generateJWTTokenWithRefresh(payload);

      this.logger.log(`Successfully registered user ID: ${user.id}`);
      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          name: user.aliasLoginName,
          email: user.loginId,
          userType: user.userType,
        },
      };
    } catch (error) {
      this.logger.error(`Registration failed for ${registerDto.email}: ${error.message}`, error.stack);
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new HttpException(`Registration failed: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    this.logger.log(`Auth service login attempt for: ${loginDto.email}`);
    try {
      const user = await this.usersService.findByLoginId(loginDto.email);

      if (!user || user.loginId !== loginDto.email) {
        this.logger.warn(`Auth login failed: User ${loginDto.email} not found`);
        throw new UnauthorizedException('Invalid credentials');
      }

      const isPasswordValid = await this.usersService.comparePassword(
        loginDto.password,
        user.password,
      );

      if (!isPasswordValid) {
        this.logger.warn(`Auth login failed: Password mismatch for ${loginDto.email}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      const payload = { sub: user.id, loginId: user.loginId };
      const { accessToken, refreshToken } = await this.generateJWTTokenWithRefresh(payload);

      this.logger.log(`Auth login successful for: ${loginDto.email}`);
      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          name: user.aliasLoginName,
          email: user.loginId,
        },
      };
    } catch (error) {
      this.logger.error(`Auth login error for ${loginDto.email}: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) throw error;
      throw new HttpException('An error occurred during login', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const isPasswordValid = await this.usersService.comparePassword(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, loginId: user.loginId };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        id: user.id,
        name: user.aliasLoginName,
        email: user.loginId,
        userType: user.userType,
      },
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    this.logger.log(`Validating user ID: ${userId}`);
    try {
      return await this.usersService.findById(userId);
    } catch (error) {
      this.logger.error(`Validation failed for user ${userId}: ${error.message}`);
      return null;
    }
  }

  async generateJWTTokenWithRefresh(payload: any) {
    this.logger.log(`Generating tokens for user: ${payload.loginId}`);
    try {
      const access_token = this.jwtService.sign(payload, {
        secret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
        expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN as any) || '5m',
      });
      const refresh_token = this.jwtService.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN as any) || '7d',
      });
      return { accessToken: access_token, refreshToken: refresh_token };
    } catch (error) {
      this.logger.error(`Token generation failed: ${error.message}`, error.stack);
      throw new HttpException('Failed to generate authentication tokens', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async refreshToken(refreshTokenStr: string): Promise<any> {
    this.logger.log('Refreshing auth token');
    try {
      const payload = await this.jwtService.verifyAsync(refreshTokenStr, {
        secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        this.logger.warn(`Refresh failed: User ${payload.sub} not found`);
        throw new UnauthorizedException('User not found');
      }

      const newPayload = { sub: user.id, loginId: user.loginId };
      return await this.generateJWTTokenWithRefresh(newPayload);
    } catch (error) {
      this.logger.warn(`Refresh failed: ${error.message}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}

