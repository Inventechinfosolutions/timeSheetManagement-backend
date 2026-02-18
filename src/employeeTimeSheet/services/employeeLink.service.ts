import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { User } from '../../users/entities/user.entity';
import { UserStatus } from '../../users/enums/user-status.enum';
import { JwtService } from '@nestjs/jwt'; 
import { ResetPasswordDto } from '../dto/resetPassword.dto';
import { AuthService } from '../../auth/auth.service';
import { EmailService } from '../../email/email.service';

@Injectable()
export class EmployeeLinkService {
  private readonly logger = new Logger(EmployeeLinkService.name);

  constructor(
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
  ) {}

  async resetPasswordWithToken(resetPasswordDto: ResetPasswordDto): Promise<{ message: string; employeeId: string }> {
    this.logger.log(`Attempting password reset with context: ${JSON.stringify({ loginId: resetPasswordDto.loginId, hasToken: !!resetPasswordDto.token })}`);
    try {
      let employeeId = resetPasswordDto.loginId;

      if (resetPasswordDto.token) {
        try {
          const payload = this.jwtService.verify(resetPasswordDto.token, {
            secret: process.env.JWT_SECRET || 'your-secret-key',
          });
          
          if (payload.type !== 'activation') {
             throw new BadRequestException('Invalid token type');
          }
          
          employeeId = payload.sub;
          this.logger.log(`Token verified for employee: ${employeeId}`);
        } catch (error) {
           this.logger.error(`Token verification failed: ${error.message}`);
           throw new HttpException('Invalid or expired activation link', HttpStatus.UNAUTHORIZED);
        }
      }

      if (!employeeId) {
        throw new BadRequestException('Employee ID or Token is required');
      }

      const employee = await this.employeeDetailsRepository.findOne({ 
        where: [{ employeeId: ILike(employeeId) }, { id: !isNaN(Number(employeeId)) ? Number(employeeId) : -1 }] 
      });

      if (!employee) {
        throw new NotFoundException(`Employee with ID ${employeeId} not found`);
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(resetPasswordDto.password, salt);

      employee.password = hashedPassword;
      employee.userStatus = UserStatus.ACTIVE;
      await this.employeeDetailsRepository.save(employee);

      const user = await this.userRepository.findOne({ where: { loginId: employee.employeeId.toLowerCase() } });
      if (user) {
         user.password = hashedPassword;
         user.resetRequired = false;
         user.mobileVerification = true;
         user.status = UserStatus.ACTIVE;
         await this.userRepository.save(user);
         this.logger.log(`User entity updated for: ${employee.employeeId}`);
      }

      return {
        message: 'Password successfully updated.',
        employeeId: employee.employeeId,
      };

    } catch (error) {
       this.logger.error(`Error in resetPasswordWithToken: ${error.message}`, error.stack);
       if (error instanceof HttpException) throw error;
       throw new HttpException('Failed to reset password', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async verifyAndActivateEmployee(token: string): Promise<any> {
    try {
      this.logger.log(`Verifying activation token`);
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'your-secret-key',
      });

      if (payload.type !== 'activation') {
        throw new BadRequestException('Invalid token type');
      }

      const employeeId = payload.sub;
      this.logger.log(`Parsed employeeId from token: ${employeeId} (Type: ${typeof employeeId})`);

      const employee = await this.employeeDetailsRepository.findOne({ 
        where: [
          { employeeId: ILike(String(employeeId)) },
          { id: !isNaN(Number(employeeId)) ? Number(employeeId) : -1 }
        ]
      });

      if (!employee) {
        throw new NotFoundException('Employee associated with this token not found');
      }

      // Try to find user by exact employeeId first, then lowercase for compatibility
      let user = await this.userRepository.findOne({ where: { loginId: employee.employeeId } });
      if (!user) {
        user = await this.userRepository.findOne({ where: { loginId: employee.employeeId.toLowerCase() } });
      }
      
      if (user) {
        // Allow reactivation if status is DRAFT (new activation link was sent)
        // If already ACTIVE, we still allow it but log a warning (in case of resend activation link)
        if (user.status === UserStatus.ACTIVE) {
          this.logger.warn(`User ${employee.employeeId} is already ACTIVE, but allowing reactivation via new token`);
        }
        
        user.status = UserStatus.ACTIVE;
        user.mobileVerification = true;
        // Keep resetRequired as true if it was set (user needs to change password)
        // Only set to false if it was already false (user already changed password before)
        if (user.resetRequired === undefined || user.resetRequired === null) {
          user.resetRequired = true;
        }
        user.lastLoggedIn = new Date();
        await this.userRepository.save(user);

        // Sync with EmployeeDetails
        employee.userStatus = UserStatus.ACTIVE;
        await this.employeeDetailsRepository.save(employee);
        
        this.logger.log(`User ${employee.employeeId} activated via token and employee status synced`);
      }

      const authPayload = { sub: user?.id || employee.employeeId, loginId: employee.employeeId };
      const loginTokens = await this.authService.generateJWTTokenWithRefresh(authPayload);

      return {
        userId: user?.id || employee.employeeId,
        fullName: employee.fullName,
        email: employee.email,
        employeeId: employee.employeeId,
        accessToken: loginTokens.accessToken,
        refreshToken: loginTokens.refreshToken
      };
    } catch (error) {
      this.logger.error(`Activation verification failed: ${error.message}`);
      throw new HttpException(error.message || 'Token verification failed', error.status || HttpStatus.BAD_REQUEST);
    }
  }

  async generateActivationLink(identifier: string): Promise<{ message: string; employeeId: string; loginId: string; password: string; activationLink: string }> {
    this.logger.log(`Generating activation link for employee identifier: ${identifier}`);
    try {
      let employee: EmployeeDetails | null = null;
      
      // Support finding by numeric ID or string employeeId
      employee = await this.employeeDetailsRepository.findOne({
        where: [{ employeeId: ILike(identifier) }, { id: !isNaN(Number(identifier)) ? Number(identifier) : -1 }]
      });

      if (!employee) {
        this.logger.warn(`Employee with identifier ${identifier} not found`);
        throw new NotFoundException(`Employee with ID ${identifier} not found`);
      }

      const password = this.generateUniquePassword(12);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      employee.password = hashedPassword;
      await this.employeeDetailsRepository.save(employee);

      // Sync with User table (try exact match first, then lowercase for compatibility)
      let user = await this.userRepository.findOne({ where: { loginId: employee.employeeId } });
      if (!user) {
        user = await this.userRepository.findOne({ where: { loginId: employee.employeeId.toLowerCase() } });
        // If found by lowercase, update to exact case
        if (user) {
          user.loginId = employee.employeeId;
          await this.userRepository.save(user);
          this.logger.log(`User loginId updated to match exact case: ${employee.employeeId}`);
        }
      }
      if (user) {
        user.password = hashedPassword;
        user.resetRequired = true; // Set resetRequired to true so user must change password on first login
        user.status = UserStatus.DRAFT; // Reset status to DRAFT to allow reactivation with new link
        await this.userRepository.save(user);
        this.logger.log(`User password synchronized, resetRequired set to true, and status reset to DRAFT for: ${employee.employeeId}`);
      }

      const payload = { 
        sub: String(employee.employeeId),
        id: employee.id,
        email: employee.email,
        type: 'activation' 
      };
      
      const token = this.jwtService.sign(payload, { 
        secret: process.env.JWT_SECRET || 'your-secret-key',
        expiresIn: '24h' 
      });
      
      const activationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/timesheet/activate?token=${token}`;
      // const networkIp = '192.168.1.31';
      // const activationLink = `http://${networkIp}:5173/timesheet/activate?token=${token}`;

      const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: #1a73e8; margin: 0; font-size: 24px;">Welcome to Inventech Info Solutions</h2>
          </div>
          <p style="color: #5f6368; font-size: 16px; line-height: 1.5;">Hello <strong>${employee.fullName}</strong>,</p>
          <p style="color: #5f6368; font-size: 16px; line-height: 1.5;">Your employee account has been successfully created. Please find your login credentials below:</p>
          
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 25px 0; border-left: 4px solid #1a73e8;">
            <p style="margin: 5px 0; color: #3c4043;"><strong>Employee ID:</strong> ${employee.employeeId}</p>
            <p style="margin: 5px 0; color: #3c4043;"><strong>Temporary Password:</strong> ${password}</p>
          </div>

          <p style="color: #5f6368; font-size: 16px; line-height: 1.5;">Click the button below to activate your account and login for the first time:</p>
          
          <div style="text-align: center; margin: 35px 0;">
            <a href="${activationLink}" style="background-color: #1a73e8; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Activate My Account</a>
          </div>

          <p style="color: #d93025; font-size: 14px; font-weight: 500;">Note: This activation link will expire in 24 hours.</p>
          <p style="color: #5f6368; font-size: 14px; line-height: 1.5;">If you have any issues, please contact the HR department.</p>
          
          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="font-size: 12px; color: #9aa0a6; text-align: center;">This is an automated message from Inventech Info Solutions. Please do not reply.</p>
        </div>
      `;

      try {
        await this.emailService.sendEmail(
          employee.email,
          'Your Employee Account Credentials',
          `Hello ${employee.fullName}, your account has been created. Employee ID: ${employee.employeeId}, Password: ${password}. Activate here: ${activationLink}`,
          htmlContent
        );
      } catch (emailError) {
        this.logger.error(`Failed to send activation email to ${employee.email}: ${emailError.message}`);
      }

      this.logger.log(`Activation link generated and sent for employee identifier: ${identifier}`);

      return {
        message: 'Activation link and credentials generated and sent successfully',
        employeeId: employee.employeeId,
        loginId: employee.employeeId,
        password: password,
        activationLink: activationLink
      };

    } catch (error) {
       this.logger.error(`Error generating activation link: ${error.message}`, error.stack);
       if (error instanceof HttpException) throw error;
       throw new HttpException('Failed to generate activation link', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private generateUniquePassword(length: number = 12): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      password += charset[bytes[i] % charset.length];
    }
    return password;
  }
}
