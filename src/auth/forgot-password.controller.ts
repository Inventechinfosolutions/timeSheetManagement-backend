import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ForgotPasswordService } from './forgot-password.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';

@Controller('auth')
export class ForgotPasswordController {
  constructor(private forgotPasswordService: ForgotPasswordService) {}

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.forgotPasswordService.forgotPassword(dto.loginId, dto.email);
  }

  @Get('verify-reset-token')
  verifyToken(@Query() dto: VerifyTokenDto) {
    return this.forgotPasswordService.verifyToken(dto.loginId, dto.token);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.forgotPasswordService.resetPassword(dto.loginId, dto.newPassword, dto.token);
  }
}
