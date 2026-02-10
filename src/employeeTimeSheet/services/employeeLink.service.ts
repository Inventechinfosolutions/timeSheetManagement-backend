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
    const METHOD = 'resetPasswordWithToken';
    this.logger.log(`[${METHOD}] Attempting password reset for: ${resetPasswordDto.loginId}`);

    try {
      let employeeId = resetPasswordDto.loginId;

      // STEP 1: Verify Token if provided
      if (resetPasswordDto.token) {
        this.logger.debug(`[${METHOD}][STEP 1] Verifying activation token...`);
        try {
          const payload = this.jwtService.verify(resetPasswordDto.token, {
            secret: process.env.JWT_SECRET || 'your-secret-key',
          });
          
          if (payload.type !== 'activation') {
             this.logger.warn(`[${METHOD}][STEP 1] Invalid token type: ${payload.type}`);
             throw new BadRequestException('Invalid token type');
          }
          
          employeeId = payload.sub;
          this.logger.debug(`[${METHOD}][STEP 1] Token verified for employee: ${employeeId}`);
        } catch (error) {
           this.logger.error(`[${METHOD}][STEP 1] Token verification failed: ${error.message}`);
           throw new HttpException('Invalid or expired activation link', HttpStatus.UNAUTHORIZED);
        }
      }

      if (!employeeId) {
        throw new BadRequestException('Employee ID or Token is required');
      }

      // STEP 2: Find Employee
      this.logger.debug(`[${METHOD}][STEP 2] Fetching employee details...`);
      const employee = await this.employeeDetailsRepository.findOne({ 
        where: [{ employeeId: ILike(employeeId) }, { id: !isNaN(Number(employeeId)) ? Number(employeeId) : -1 }] 
      });

      if (!employee) {
        this.logger.warn(`[${METHOD}][STEP 2] Employee ID ${employeeId} not found`);
        throw new NotFoundException(`Employee with ID ${employeeId} not found`);
      }

      // STEP 3: Hash and Save Password
      this.logger.debug(`[${METHOD}][STEP 3] Hashing new password...`);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(resetPasswordDto.password, salt);

      employee.password = hashedPassword;
      await this.employeeDetailsRepository.save(employee);

      // STEP 4: Sync User Table
      this.logger.debug(`[${METHOD}][STEP 4] Synchronizing with User entity...`);
      const user = await this.userRepository.findOne({ where: { loginId: employee.employeeId.toLowerCase() } });
      if (user) {
         user.password = hashedPassword;
         user.resetRequired = false;
         user.mobileVerification = true;
         user.status = UserStatus.ACTIVE;
         await this.userRepository.save(user);
         this.logger.log(`[${METHOD}][STEP 4] User entity activated and password synced for: ${employee.employeeId}`);
      }

      this.logger.log(`[${METHOD}] Password reset completed for: ${employee.employeeId}`);
      return {
        message: 'Password successfully updated.',
        employeeId: employee.employeeId,
      };

    } catch (error) {
       this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
       if (error instanceof HttpException) throw error;
       throw new HttpException('Failed to reset password', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async verifyAndActivateEmployee(token: string): Promise<any> {
    const METHOD = 'verifyAndActivateEmployee';
    this.logger.log(`[${METHOD}] Verifying activation token...`);

    try {
      // STEP 1: Verify Token
      this.logger.debug(`[${METHOD}][STEP 1] Parsing payload...`);
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'your-secret-key',
      });

      if (payload.type !== 'activation') {
        this.logger.warn(`[${METHOD}][STEP 1] Invalid token type: ${payload.type}`);
        throw new BadRequestException('Invalid token type');
      }

      const employeeId = payload.sub;

      // STEP 2: Find Employee
      this.logger.debug(`[${METHOD}][STEP 2] Fetching employee ${employeeId}...`);
      const employee = await this.employeeDetailsRepository.findOne({ 
        where: [
          { employeeId: ILike(String(employeeId)) },
          { id: !isNaN(Number(employeeId)) ? Number(employeeId) : -1 }
        ]
      });

      if (!employee) {
        this.logger.warn(`[${METHOD}][STEP 2] Employee ID ${employeeId} not found`);
        throw new NotFoundException('Employee associated with this token not found');
      }

      // STEP 3: Find and Update User
      this.logger.debug(`[${METHOD}][STEP 3] Updating User status to ACTIVE...`);
      let user = await this.userRepository.findOne({ where: { loginId: employee.employeeId } });
      if (!user) {
        user = await this.userRepository.findOne({ where: { loginId: employee.employeeId.toLowerCase() } });
      }
      
      if (user) {
        if (user.status === UserStatus.ACTIVE) {
          this.logger.warn(`[${METHOD}][STEP 3] User ${employee.employeeId} is already ACTIVE`);
        }
        
        user.status = UserStatus.ACTIVE;
        user.mobileVerification = true;
        if (user.resetRequired === undefined || user.resetRequired === null) {
          user.resetRequired = true;
        }
        user.lastLoggedIn = new Date();
        await this.userRepository.save(user);
        this.logger.debug(`[${METHOD}][STEP 3] User activated successfully`);
      }

      // STEP 4: Post-Activation Login
      this.logger.debug(`[${METHOD}][STEP 4] Generating post-activation login tokens...`);
      const authPayload = { sub: user?.id || employee.employeeId, loginId: employee.employeeId };
      const loginTokens = await this.authService.generateJWTTokenWithRefresh(authPayload);

      this.logger.log(`[${METHOD}] Activation successful for: ${employee.employeeId}`);
      return {
        userId: user?.id || employee.employeeId,
        fullName: employee.fullName,
        email: employee.email,
        employeeId: employee.employeeId,
        accessToken: loginTokens.accessToken,
        refreshToken: loginTokens.refreshToken
      };
    } catch (error) {
      this.logger.error(`[${METHOD}] Activation failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(error.message || 'Token verification failed', HttpStatus.BAD_REQUEST);
    }
  }

  async generateActivationLink(identifier: string): Promise<{ message: string; employeeId: string; loginId: string; password: string; activationLink: string }> {
    const METHOD = 'generateActivationLink';
    this.logger.log(`[${METHOD}] Generating link for identifier: ${identifier}`);

    try {
      // STEP 1: Fetch Employee
      this.logger.debug(`[${METHOD}][STEP 1] Fetching employee...`);
      const employee = await this.employeeDetailsRepository.findOne({
        where: [{ employeeId: ILike(identifier) }, { id: !isNaN(Number(identifier)) ? Number(identifier) : -1 }]
      });

      if (!employee) {
        this.logger.warn(`[${METHOD}][STEP 1] Employee not found: ${identifier}`);
        throw new NotFoundException(`Employee with ID ${identifier} not found`);
      }

      // STEP 2: Generate Temporary Password
      this.logger.debug(`[${METHOD}][STEP 2] Generating credentials...`);
      const password = this.generateUniquePassword(12);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      employee.password = hashedPassword;
      await this.employeeDetailsRepository.save(employee);

      // STEP 3: Sync User Table
      this.logger.debug(`[${METHOD}][STEP 3] Synchronizing user record...`);
      let user = await this.userRepository.findOne({ where: { loginId: employee.employeeId } });
      if (!user) {
        user = await this.userRepository.findOne({ where: { loginId: employee.employeeId.toLowerCase() } });
        if (user) {
          user.loginId = employee.employeeId;
          await this.userRepository.save(user);
        }
      }
      if (user) {
        user.password = hashedPassword;
        user.resetRequired = true; 
        user.status = UserStatus.DRAFT; 
        await this.userRepository.save(user);
      }

      // STEP 4: Generate Token and Link
      this.logger.debug(`[${METHOD}][STEP 4] Signing JWT activation token...`);
      const payload = { sub: String(employee.employeeId), id: employee.id, email: employee.email, type: 'activation' };
      const token = this.jwtService.sign(payload, { 
        secret: process.env.JWT_SECRET || 'your-secret-key',
        expiresIn: '24h' 
      });
      
      const activationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/timesheet/activate?token=${token}`;

      // STEP 5: Notify
      this.logger.debug(`[${METHOD}][STEP 5] Sending activation email to ${employee.email}...`);
      const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #1a73e8; text-align: center;">Welcome to Inventech Info Solutions</h2>
          <p>Hello <strong>${employee.fullName}</strong>,</p>
          <p>Your account has been created. Use the credentials below to activate:</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #1a73e8; margin: 20px 0;">
            <p><strong>Employee ID:</strong> ${employee.employeeId}</p>
            <p><strong>Temporary Password:</strong> ${password}</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${activationLink}" style="background-color: #1a73e8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Activate My Account</a>
          </div>
          <p style="color: #d93025; font-size: 14px;">Link expires in 24 hours.</p>
        </div>
      `;

      await this.emailService.sendEmail(employee.email, 'Your Employee Account Credentials', 'Account Activation', htmlContent);

      this.logger.log(`[${METHOD}] Activation link sent for: ${employee.employeeId}`);
      return {
        message: 'Activation link and credentials generated and sent successfully',
        employeeId: employee.employeeId,
        loginId: employee.employeeId,
        password: password,
        activationLink: activationLink
      };
    } catch (error) {
       this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
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
