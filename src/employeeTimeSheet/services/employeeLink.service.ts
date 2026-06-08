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
import { getSimpleEmailTemplate } from '../../common/mail/templates/simple-email.template';

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
  ) { }

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
      employee.lastLinkSentAt = new Date();
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

      const htmlContent = getSimpleEmailTemplate({
        recipientName: employee.fullName,
        subject: 'Your Employee Account Credentials',
        bodyLines: [
          'Your employee account has been created. Please use the credentials below:',
          `<strong>Employee ID:</strong> ${employee.employeeId}`,
          `<strong>Temporary Password:</strong> ${password}`,
          'Use the link below to activate your account. This link expires in 24 hours.',
        ],
        actionLabel: 'Activate my account',
        actionUrl: activationLink,
      });

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
