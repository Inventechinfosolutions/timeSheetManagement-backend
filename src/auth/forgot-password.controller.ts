import { Controller, Post, Body } from '@nestjs/common';
import { ForgotPasswordService } from './forgot-password.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class ForgotPasswordController {
  constructor(private forgotPasswordService: ForgotPasswordService) {}

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.forgotPasswordService.forgotPassword(dto.loginId, dto.email);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.forgotPasswordService.resetPassword(dto.loginId, dto.newPassword);
  }
}
