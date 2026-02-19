import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/service/user.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    try {
      const user = await this.usersService.create({
        aliasLoginName: registerDto.name,
        loginId: registerDto.email,
        password: registerDto.password,
      });

      const payload = { sub: user.id, loginId: user.loginId };
      const { accessToken, refreshToken } = await this.generateJWTTokenWithRefresh(payload);

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
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new Error('Registration failed');
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByLoginId(loginDto.email);

    if (!user || user.loginId !== loginDto.email) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.usersService.comparePassword(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, loginId: user.loginId };
    const { accessToken, refreshToken } = await this.generateJWTTokenWithRefresh(payload);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        name: user.aliasLoginName,
        email: user.loginId,
      },
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    return await this.usersService.findById(userId);
  }

  async generateJWTTokenWithRefresh(payload: any) {
    const access_token = this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
      expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN as any) || '5m',
    });
    const refresh_token = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN as any) || '7d',
    });
    return { accessToken: access_token, refreshToken: refresh_token };
  }

  async refreshToken(refreshTokenStr: string): Promise<any> {
    try {
      const payload = await this.jwtService.verifyAsync(refreshTokenStr, {
        secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
      });
      
      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const newPayload = { sub: user.id, loginId: user.loginId };
      return this.generateJWTTokenWithRefresh(newPayload);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}

