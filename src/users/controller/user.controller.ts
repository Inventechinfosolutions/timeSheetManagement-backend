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
import { UsersService } from '../service/user.service';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UserLoginDto } from '../dto/user-login.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ReceptionistReadOnlyGuard } from '../../auth/guards/receptionist-readonly.guard';
import { UserType } from '../enums/user-type.enum';
import { UserStatus } from '../enums/user-status.enum';
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

  constructor(private readonly usersService: UsersService) {}

  @Post('create')
  @ApiOperation({ summary: 'Create new user (e.g. Receptionist with default password Invent123, reset on first login)' })
  @ApiBody({ type: CreateUserDto })
  async createUser(@Body() createUserDto: CreateUserDto): Promise<any> {
    try {
      this.logger.log(`Creating user: ${createUserDto.loginId}, role: ${createUserDto.role ?? 'EMPLOYEE'}`);
      const isReceptionist = createUserDto.role === UserType.RECEPTIONIST;
      const password = isReceptionist && !createUserDto.password
        ? 'Invent123'
        : createUserDto.password;
      if (!password) {
        throw new HttpException('Password is required when role is not Receptionist', HttpStatus.BAD_REQUEST);
      }
      const user = await this.usersService.create({
        loginId: createUserDto.loginId,
        aliasLoginName: createUserDto.name,
        password,
        userType: createUserDto.role ?? UserType.EMPLOYEE,
        role: createUserDto.role ?? undefined,
        status: UserStatus.ACTIVE,
        resetRequired: isReceptionist,
      });
      const { password: _p, ...result } = user;
      return {
        success: true,
        statusCode: HttpStatus.CREATED,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Error creating user ${createUserDto.loginId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'User login' })
  @ApiBody({ type: UserLoginDto })
  async login(@Body() userLoginDto: UserLoginDto, @Res() res): Promise<any> {
    try {
      this.logger.log(`User login attempt: ${userLoginDto.loginId}`);
      const response = await this.usersService.login(userLoginDto);

      res.cookie('refreshToken', response.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      return res.json({
        success: true,
        statusCode: 200,
        data: {
          userId: response.userId,
          name: response.name,
          email: response.email,
          userType: response.userType,
          role: response.role || null,
          accessToken: response.accessToken,
          resetRequired: response.resetRequired,
          status: response.status,
        },
      });
    } catch (error) {
      this.logger.error(`Login failed for ${userLoginDto.loginId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('auth/me')
  async me(@Req() req: any, @Res() res: any): Promise<any> {
    try {
      this.logger.log('Fetching current user profile (me)');
      const { refreshToken } = req?.cookies || {}; // Handle potential missing cookies
      
      if (!refreshToken) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
      const response = await this.usersService.me(refreshToken);

      res.cookie('refreshToken', response.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      // Remove sensitive info before returning
      const { password, refreshToken: rt, ...responseData } = response;
      
      return res.json({
        success: true,
        statusCode: 200,
        data: responseData,
      });
    } catch (error) {
      this.logger.error(`Error in me controller: ${error.message}`, error.stack);
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
      this.logger.log('User logout attempt');
      res.cookie('refreshToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 0,
      });
      res.cookie('accessToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 0,
      });

      return res.json({ success: true });
    } catch (error) {
      this.logger.error(`Logout failed: ${error.message}`, error.stack);
      throw new HttpException(error.message, error.status);
    }
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard, ReceptionistReadOnlyGuard)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Change Password',
    description: 'Allows authenticated users to change their password.',
  })
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(@Req() req, @Body() changePasswordDto: ChangePasswordDto, @Res() res) {
    try {
      const userId = req.user.id; // JwtAuthGuard adds user to req
      this.logger.log(`Password change attempt for user ID: ${userId}`);
      const response = await this.usersService.changePassword(userId, changePasswordDto);
      return res.json(response);
    } catch (error) {
      this.logger.error(`Error changing password: ${error.message}`, error.stack);
      throw error;
    }
  }
}
