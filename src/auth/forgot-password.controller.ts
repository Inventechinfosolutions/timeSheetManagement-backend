import { Controller, Post, Body, Get, Query, Logger } from '@nestjs/common';
import { ForgotPasswordService } from './forgot-password.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';

@Controller('auth')
export class ForgotPasswordController {
  private readonly logger = new Logger(ForgotPasswordController.name);
  constructor(private forgotPasswordService: ForgotPasswordService) {}

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    try {
      this.logger.log(`Forgot password request for: ${dto.loginId || dto.email}`);
      return this.forgotPasswordService.forgotPassword(dto.loginId, dto.email);
    } catch (error) {
      this.logger.error(`Error in forgot-password: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('verify-reset-token')
  verifyToken(@Query() dto: VerifyTokenDto) {
    try {
      this.logger.log(`Verifying reset token for: ${dto.loginId}`);
      return this.forgotPasswordService.verifyToken(dto.loginId, dto.token);
    } catch (error) {
      this.logger.error(`Error verifying token for ${dto.loginId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    try {
      this.logger.log(`Reset password attempt for: ${dto.loginId}`);
      return this.forgotPasswordService.resetPassword(dto.loginId, dto.newPassword, dto.token);
    } catch (error) {
      this.logger.error(`Error resetting password for ${dto.loginId}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
