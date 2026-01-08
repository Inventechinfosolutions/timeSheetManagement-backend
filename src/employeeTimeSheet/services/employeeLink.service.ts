import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { JwtService } from '@nestjs/jwt'; 
// import { MailService } from 'src/common/mail/mail.service'; 

@Injectable()
export class EmployeeLinkService {
  private readonly logger = new Logger(EmployeeLinkService.name);

  constructor(
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    private readonly jwtService: JwtService,
    // private readonly mailService: MailService,
  ) {}

  async generateActivationLink(id: number): Promise<{ message: string; employeeId: string; password: string; activationLink: string }> {
    this.logger.log(`Generating activation link for employee ID: ${id}`);
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { id },
      });

      if (!employee) {
        this.logger.warn(`Employee with ID ${id} not found`);
        throw new NotFoundException(`Employee with ID ${id} not found`);
      }

      // Generate unique strong password
      const password = this.generateUniquePassword(12);
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Save hashed password
      employee.password = hashedPassword;
      await this.employeeDetailsRepository.save(employee);
      this.logger.log(`Credentials generated and saved for employee: ${employee.employeeId}`);

      // Generate real JWT token
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

      // Mock sending email
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

      this.logger.log(`Activation link generated and sent for employee ID: ${id}`);

      return {
        message: 'Activation link and credentials generated successfully',
        employeeId: employee.employeeId,
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
