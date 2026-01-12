import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { UserLoginDto } from '../dto/user-login.dto';
import { LoginResponse } from '../types/login-response.type';
import { PublicService } from '../service/public.service';
import { ResetPasswordDto } from '../../employeeTimeSheet/dto/resetPassword.dto';

@ApiTags('Public')
@Controller('public')
export class PublicController {
  private readonly logger = new Logger(PublicController.name);

  constructor(
    private readonly publicService: PublicService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiOkResponse({ description: 'Login Successful' })
  @ApiUnauthorizedResponse({ description: 'Invalid Credentials' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid Input Format' })
  @ApiNotFoundResponse({ description: 'User Not Found' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  async userLogin(@Body() userDetails: UserLoginDto, @Req() req: any, @Res() res: Response): Promise<any> {
    try {
      this.logger.log(`Login attempt for user: ${userDetails.loginId}`);
      const response: LoginResponse = await this.publicService.login(userDetails);

      res.cookie('refreshToken', response.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      const { accessToken, userId, name, email } = response;

      return res.json({
        success: true,
        accessToken,
        userId,
        name,
        email
      });
    } catch (error) {
       this.logger.error(`Login failed: ${error.message}`);
       throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('verify-activation-employee')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify employee activation link and login automatically' })
  @ApiOkResponse({ description: 'Activation and Login Successful' })
  @ApiUnauthorizedResponse({ description: 'Invalid or Expired Token' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @ApiBadRequestResponse({ description: 'Invalid Token' })
  async verifyActivationEmployee(@Query('token') token: string, @Res() res: Response) {
    try {
      this.logger.log(`Verifying activation for employee link`);
      const result = await this.publicService.verifyAndActivateEmployee(token);

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      const { accessToken, userId, fullName, email, employeeId } = result;

      return res.json({
        success: true,
        message: 'Email verification and activation successful',
        accessToken,
        userId,
        fullName,
        email,
        employeeId
      });
    } catch (error) {
      this.logger.error(`Activation failed: ${error.message}`);
      throw new HttpException(error.message || 'Token verification failed', error.status || HttpStatus.BAD_REQUEST);
    }
  }

  @Post('reset-password-employee')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset employee password via activation link' })
  @ApiOkResponse({ description: 'Password reset successful' })
  @ApiUnauthorizedResponse({ description: 'Invalid or Expired Token' })
  @ApiBadRequestResponse({ description: 'Invalid Input' })
  async resetPasswordEmployee(@Body() resetPasswordDto: ResetPasswordDto) {
    try {
      this.logger.log(`Public password reset attempt for employee`);
      return await this.publicService.resetPasswordEmployee(resetPasswordDto);
    } catch (error) {
       this.logger.error(`Reset password failed: ${error.message}`);
       throw error;
    }
  }
}
