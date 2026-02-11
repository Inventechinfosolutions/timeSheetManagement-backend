import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../users/entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { EmailService } from '../email/email.service';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';

@Injectable()
export class ForgotPasswordService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(PasswordResetToken)
    private tokenRepo: Repository<PasswordResetToken>,

    @InjectRepository(EmployeeDetails)
    private employeeRepo: Repository<EmployeeDetails>,

    private emailService: EmailService,
  ) {}

  // STEP 1
  async forgotPassword(loginId: string, email: string) {
    // 1. Try to find the user in the User table (case-insensitive)
    let user = await this.userRepo.findOne({ where: { loginId: ILike(loginId) } });

    // 2. Try to find email in EmployeeDetails
    const employee = await this.employeeRepo.findOne({ 
      where: [
        { employeeId: ILike(loginId) },
        { email: ILike(email) }
      ]
    });

    if (!user && employee) {
        // If not in User table but in EmployeeDetails, find or sync User
        user = await this.userRepo.findOne({ where: { loginId: ILike(employee.employeeId) } });
    }

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // Security: Verify email matches if it's an employee
    if (employee && employee.email.toLowerCase() !== email.toLowerCase()) {
        throw new HttpException('Provided email does not match our records', HttpStatus.BAD_REQUEST);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    await this.tokenRepo.save({
      loginId: user.loginId,
      email,
      token: resetToken,
      expiresAt,
    });

    const frontendUrl = process.env.FRONTEND_URL;
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}&loginId=${user.loginId}`;

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="color: #1a73e8; margin: 0; font-size: 24px;">Password Reset Request</h2>
        </div>
        <p style="color: #5f6368; font-size: 16px; line-height: 1.5;">Hello,</p>
        <p style="color: #5f6368; font-size: 16px; line-height: 1.5;">We received a request to reset your password. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 40px 0;">
          <a href="${resetLink}" style="background-color: #1a73e8; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block; transition: background-color 0.3s ease;">Reset My Password</a>
        </div>
        <p style="color: #5f6368; font-size: 14px; line-height: 1.5;">If the button doesn't work, copy and paste the following link into your browser:</p>
        <p style="word-break: break-all; color: #1a73e8; font-size: 13px;">${resetLink}</p>
        <p style="color: #d93025; font-size: 14px; font-weight: 500; margin-top: 20px;">Note: This link will expire in 5 minutes.</p>
        <p style="color: #5f6368; font-size: 14px; line-height: 1.5;">If you did not request this, please ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #9aa0a6; text-align: center;">This is an automated message from Inventech Info Solutions. Please do not reply.</p>
      </div>
    `;

    try {
      await this.emailService.sendEmail(
        email,
        'Password Reset request',
        `Reset your password using this link: ${resetLink}. It is valid for 5 minutes.`,
        htmlContent
      );
    } catch (error) {
      // If email fails, delete the token we just saved to keep state consistent
      await this.tokenRepo.delete({ token: resetToken });
      throw new HttpException(`Failed to send email: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return { 
      message: 'Password reset link sent to registered email',
      token: resetToken,
      resetLink: resetLink
    };
  }

  // STEP 2
  async verifyToken(loginId: string, token: string) {
    const record = await this.tokenRepo.findOne({
      where: { loginId: ILike(loginId), token },
      order: { createdAt: 'DESC' },
    });

    if (!record) {
      throw new HttpException(
        'Invalid or expired reset link. Please request a new password reset link.',
        HttpStatus.BAD_REQUEST
      );
    }

    // Check if token has expired - using current time in UTC
    const now = new Date();
    const expiresAt = new Date(record.expiresAt);
    
    if (expiresAt.getTime() < now.getTime()) {
      // Delete expired token
      await this.tokenRepo.delete({ id: record.id });
      throw new HttpException(
        'Session expired. This password reset link has expired. The link is only valid for 5 minutes. Please request a new password reset link.',
        HttpStatus.BAD_REQUEST
      );
    }

    // Mark as verified if not already verified
    if (!record.verified) {
      record.verified = true;
      await this.tokenRepo.save(record);
    }

    return { 
      message: 'Link verified successfully',
      valid: true,
      expiresAt: record.expiresAt
    };
  }

  // STEP 3
  async resetPassword(loginId: string, newPassword: string, token?: string) {
    // Token is required for reset password
    if (!token) {
      throw new HttpException(
        'Reset token is required. Please use the link from your email.',
        HttpStatus.BAD_REQUEST
      );
    }

    // Validate token
    const tokenRecord = await this.tokenRepo.findOne({
      where: { loginId: ILike(loginId), token },
      order: { createdAt: 'DESC' },
    });

    if (!tokenRecord) {
      throw new HttpException(
        'Invalid reset link. Please request a new password reset link.',
        HttpStatus.BAD_REQUEST
      );
    }

    // Check if token has expired - using current time comparison
    const now = new Date();
    const expiresAt = new Date(tokenRecord.expiresAt);
    
    if (expiresAt.getTime() < now.getTime()) {
      // Delete expired token
      await this.tokenRepo.delete({ id: tokenRecord.id });
      throw new HttpException(
        'Session expired. This password reset link has expired. The link is only valid for 5 minutes. Please request a new password reset link.',
        HttpStatus.BAD_REQUEST
      );
    }

    // Delete the token after successful use to prevent reuse
    await this.tokenRepo.delete({ id: tokenRecord.id });

    const user = await this.userRepo.findOne({ where: { loginId: ILike(loginId) } });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetRequired = false; // Also clear the reset flag if it exists

    await this.userRepo.save(user);

    return { message: 'Password reset successful' };
  }
}
