import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../service/user.service';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UserLoginDto } from '../dto/user-login.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
  ApiCookieAuth,
  ApiHeader,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('TimeSheet Management')
@ApiCookieAuth()
@Controller('user')
export class UsersController {
  private logger = new Logger('UsersController');

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  @Post('create')
  @ApiOperation({ summary: 'Create new user' })
  @ApiBody({ type: CreateUserDto })
  async createUser(@Body() createUserDto: CreateUserDto): Promise<any> {
    const user = await this.usersService.create({
      loginId: createUserDto.loginId,
      aliasLoginName: createUserDto.name,
      password: createUserDto.password,
    });
    const { password, ...result } = user;
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      data: result,
    };
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'User login' })
  @ApiBody({ type: UserLoginDto })
  async login(@Body() userLoginDto: UserLoginDto, @Res() res): Promise<any> {
    const response = await this.usersService.login(userLoginDto);

    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    const isProduction = nodeEnv === 'production';
    const cookieMaxAge = this.configService.get<number>('COOKIE_MAX_AGE', 7 * 24 * 60 * 60 * 1000); // Default 7 days

    res.cookie('refreshToken', response.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: cookieMaxAge,
      path: '/',
    });

    return res.json({
      success: true,
      statusCode: 200,
      data: {
        userId: response.userId,
        name: response.name,
        email: response.email,
        userType: response.userType,
        accessToken: response.accessToken,
        resetRequired: response.resetRequired,
      },
    });
  }

  @Get('auth/me')
  async me(@Req() req: any, @Res() res: any): Promise<any> {
    try {
      const { refreshToken } = req?.cookies || {}; // Handle potential missing cookies
      
      if (!refreshToken) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
      const response = await this.usersService.me(refreshToken);

      const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
      const isProduction = nodeEnv === 'production';
      const cookieMaxAge = this.configService.get<number>('COOKIE_MAX_AGE', 7 * 24 * 60 * 60 * 1000); // Default 7 days

      res.cookie('refreshToken', response.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: cookieMaxAge,
        path: '/',
      });

      // Remove sensitive info before returning
      const { password, refreshToken: rt, ...responseData } = response;
      
      return res.json({
        success: true,
        statusCode: 200,
        data: responseData,
      });
    } catch (error) {
      this.logger.error(error);
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
  }

  @Get('logout')
  @HttpCode(200)
  @ApiOperation({
    summary: 'User logout',
    description: 'Clears authentication cookies and invalidates the current session',
  })
  async userLogout(@Req() req: any, @Res() res: any): Promise<any> {
    try {
      const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
      const isProduction = nodeEnv === 'production';
      
      res.cookie('refreshToken', '', {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: 0,
        path: '/',
      });
      res.cookie('accessToken', '', {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: 0,
        path: '/',
      });

      return res.json({ success: true });
    } catch (error) {
      throw new HttpException(error.message, error.status);
    }
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Change Password',
    description: 'Allows authenticated users to change their password.',
  })
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(@Req() req, @Body() changePasswordDto: ChangePasswordDto, @Res() res) {
    const userId = req.user.id; // JwtAuthGuard adds user to req
    const response = await this.usersService.changePassword(userId, changePasswordDto);
    return res.json(response);
  }
}
