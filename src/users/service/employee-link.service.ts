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
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { User } from '../entities/user.entity';
import { UserStatus } from '../enums/user-status.enum';
import { JwtService } from '@nestjs/jwt'; 
import { ResetPasswordDto } from '../../employeeTimeSheet/dto/resetPassword.dto';
import { AuthService } from '../../auth/auth.service';

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

      // Case-insensitive lookup
      const employee = await this.employeeDetailsRepository.findOne({ 
        where: { employeeId: ILike(employeeId) } 
      });

      if (!employee) {
        throw new NotFoundException(`Employee with ID ${employeeId} not found`);
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(resetPasswordDto.password, salt);

      employee.password = hashedPassword;
      await this.employeeDetailsRepository.save(employee);

      const user = await this.userRepository.findOne({ where: { loginId: employee.employeeId.toLowerCase() } });
      if (user) {
         user.password = hashedPassword;
         user.resetRequired = true;
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
      const employee = await this.employeeDetailsRepository.findOne({ 
        where: { employeeId: ILike(employeeId) } 
      });

      if (!employee) {
        throw new NotFoundException('Employee associated with this token not found');
      }

      const user = await this.userRepository.findOne({ where: { loginId: employee.employeeId.toLowerCase() } });
      if (user) {
        user.status = UserStatus.ACTIVE;
        user.mobileVerification = true;
        user.resetRequired = true;
        user.lastLoggedIn = new Date();
        await this.userRepository.save(user);
        this.logger.log(`User ${employee.employeeId} activated via token`);
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
      
      // Try to find by numeric ID first if identifier is a number
      if (!isNaN(Number(identifier))) {
        employee = await this.employeeDetailsRepository.findOne({
          where: { id: Number(identifier) },
        });
      }

      // If not found by numeric ID, try finding by string employeeId
      if (!employee) {
        employee = await this.employeeDetailsRepository.findOne({
          where: { employeeId: ILike(identifier) },
        });
      }

      if (!employee) {
        this.logger.warn(`Employee with identifier ${identifier} not found`);
        throw new NotFoundException(`Employee with ID ${identifier} not found`);
      }

      const password = this.generateUniquePassword(12);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      employee.password = hashedPassword;
      await this.employeeDetailsRepository.save(employee);

      // Sync with User table
      const user = await this.userRepository.findOne({ where: { loginId: employee.employeeId.toLowerCase() } });
      if (user) {
        user.password = hashedPassword;
        await this.userRepository.save(user);
        this.logger.log(`User password synchronized for: ${employee.employeeId}`);
      }

      const payload = { 
        sub: employee.employeeId, 
        email: employee.email,
        type: 'activation' 
      };
      
      const token = this.jwtService.sign(payload, { 
        secret: process.env.JWT_SECRET || 'your-secret-key',
        expiresIn: '24h' 
      });
      
      const activationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login?token=${token}`;

      this.logger.log(`
        ---------------------------------------------------
        EMAIL SENT TO: ${employee.email}
        Subject: Your Employee Account Credentials
        
        Dear ${employee.fullName},
        
        Your account has been created.
        Employee ID: ${employee.employeeId}
        Password: ${password}
        Login Link: ${activationLink}
        ---------------------------------------------------
      `);

      this.logger.log(`Activation link generated and sent for employee: ${identifier}`);
      this.logger.log(`COPY THIS LINK: ${activationLink}`);

      return {
        message: 'Activation link and credentials generated successfully',
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
