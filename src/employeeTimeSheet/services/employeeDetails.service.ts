import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { EmployeeDetailsDto } from '../dto/employeeDetails.dto';
import { ResetPasswordDto } from '../dto/resetPassword.dto';
import { UsersService } from '../../users/service/user.service';
import { UserType } from '../../users/enums/user-type.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { EmployeeLinkService } from './employeeLink.service';

@Injectable()
export class EmployeeDetailsService {
  private readonly logger = new Logger(EmployeeDetailsService.name);

  constructor(
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    private readonly usersService: UsersService,
    private readonly employeeLinkService: EmployeeLinkService,
  ) {}

  async createEmployee(
    createEmployeeDetailsDto: EmployeeDetailsDto,
  ): Promise<any> {
    try {
      this.logger.log(
        `Creating new employee: ${JSON.stringify(createEmployeeDetailsDto)}`,
      );

      // Check for duplicate Employee ID
      const duplicateEmployeeId = await this.employeeDetailsRepository.findOne({
        where: { employeeId: createEmployeeDetailsDto.employeeId },
      });
      if (duplicateEmployeeId) {
        throw new BadRequestException(
          `Employee ID ${createEmployeeDetailsDto.employeeId} is already registered`,
        );
      }

      // Check for duplicate Email
      const duplicateEmail = await this.employeeDetailsRepository.findOne({
        where: { email: createEmployeeDetailsDto.email },
      });
      if (duplicateEmail) {
        throw new BadRequestException(
          `Email address ${createEmployeeDetailsDto.email} is already registered`,
        );
      }

      // Password validation
      if (createEmployeeDetailsDto.password) {
        if (createEmployeeDetailsDto.password !== createEmployeeDetailsDto.confirmPassword) {
          throw new BadRequestException('Passwords do not match');
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        createEmployeeDetailsDto.password = await bcrypt.hash(createEmployeeDetailsDto.password, salt);
      }

      // Remove confirmPassword as it's not in the entity
      const { confirmPassword, ...employeeData } = createEmployeeDetailsDto;

      const employee = this.employeeDetailsRepository.create(
        employeeData,
      );
      const result = await this.employeeDetailsRepository.save(employee);
      
      // Also create User entity for authentication
      try {
        await this.usersService.create({
          loginId: result.employeeId,
          aliasLoginName: result.fullName,
          password: createEmployeeDetailsDto.password || 'Initial@123', // Admin can provide or it will be reset
          userType: UserType.EMPLOYEE,
          status: UserStatus.DRAFT,
          resetRequired: true,
        });
        this.logger.log(`Associated user record created for employee: ${result.employeeId}`);
      } catch (userError) {
        this.logger.error(`Failed to create associated user record: ${userError.message}`);
      }

      // Generate activation link and credentials
      const activationInfo = await this.employeeLinkService.generateActivationLink(result.employeeId);

      this.logger.log(`Employee created and activation link generated for: ${result.employeeId}`);
      
      return {
          id: result.id,
          fullName: result.fullName,
          employeeId: result.employeeId,
          email: result.email,
          department: result.department,
          designation: result.designation,
          loginId: activationInfo.loginId,
          password: activationInfo.password,
          activationLink: activationInfo.activationLink,
          message: 'Employee registered successfully'
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error creating employee: ${error.message}`, error.stack);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async getAllEmployees(
    page: number = 1,
    limit: number = 10,
    search: string = '',
  ): Promise<{
    data: EmployeeDetails[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      this.logger.log('Fetching employees with filter:', {
        page,
        limit,
        search,
      });
      const query = this.employeeDetailsRepository
        .createQueryBuilder('employee')
        .orderBy('employee.id', 'DESC');

      if (search) {
        query.where(
          '(employee.fullName LIKE :search OR employee.employeeId LIKE :search OR employee.email LIKE :search)',
          { search: `%${search}%` },
        );
      }

      const [data, total] = await query
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return {
        data,
        total,
        page,
        limit,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching employees: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to fetch employees',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getEmployeeById(id: number): Promise<EmployeeDetails> {
    try {
      this.logger.log(`Fetching employee with ID: ${id}`);
      const employee = await this.employeeDetailsRepository.findOne({
        where: { id },
      });
      if (!employee) {
        this.logger.warn(`Employee with ID ${id} not found`);
        throw new NotFoundException(`Employee with ID ${id} not found`);
      }
      return employee;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Error fetching employee: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to fetch employee',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateEmployee(
    id: number,
    updateData: Partial<EmployeeDetailsDto>,
  ): Promise<EmployeeDetails> {
    try {
      this.logger.log(
        `Updating employee ${id} with data: ${JSON.stringify(updateData)}`,
      );
      const employee = await this.getEmployeeById(id);

      // Check for duplicate Employee ID if it's being updated
      if (
        updateData.employeeId &&
        updateData.employeeId !== employee.employeeId
      ) {
        const duplicateEmployeeId = await this.employeeDetailsRepository.findOne({
          where: { employeeId: updateData.employeeId, id: Not(id) },
        });
        if (duplicateEmployeeId) {
          throw new BadRequestException(
            `Employee ID ${updateData.employeeId} is already registered`,
          );
        }
      }

      // Check for duplicate Email if it's being updated
      if (updateData.email && updateData.email !== employee.email) {
        const duplicateEmail = await this.employeeDetailsRepository.findOne({
          where: { email: updateData.email, id: Not(id) },
        });
        if (duplicateEmail) {
          throw new BadRequestException(
            `Email address ${updateData.email} is already registered`,
          );
        }
      }

      // Password validation and hashing if updated
      if (updateData.password) {
        if (updateData.password !== updateData.confirmPassword) {
          throw new BadRequestException('Passwords do not match');
        }
        const salt = await bcrypt.genSalt(10);
        updateData.password = await bcrypt.hash(updateData.password, salt);
      }

      const { confirmPassword, ...updateFields } = updateData;
      Object.assign(employee, updateFields);
      const result = await this.employeeDetailsRepository.save(employee);
      this.logger.log(`Employee ${id} updated successfully`);
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Error updating employee: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to update employee',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async partialUpdateEmployee(
    id: number,
    updateData: Partial<EmployeeDetailsDto>,
    loginId: string | number,
  ): Promise<EmployeeDetails> {
    return this.updateEmployee(id, updateData);
  }

  async deleteEmployee(id: number): Promise<void> {
    try {
      this.logger.log(`Deleting employee with ID: ${id}`);
      const result = await this.employeeDetailsRepository.delete(id);
      if (result.affected === 0) {
        throw new NotFoundException(`Employee with ID ${id} not found`);
      }
      this.logger.log(`Employee ${id} deleted successfully`);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Error deleting employee: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to delete employee',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string; employeeId: string }> {
    this.logger.log(`Resetting password for employee: ${resetPasswordDto.loginId}`);
    try {
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId: resetPasswordDto.loginId },
      });

      if (!employee) {
        this.logger.warn(`Employee not found with ID: ${resetPasswordDto.loginId}`);
        throw new NotFoundException('Employee not found');
      }

      const salt = await bcrypt.genSalt(10);
      employee.password = await bcrypt.hash(resetPasswordDto.password, salt);
      // employee.resetRequired = false; // Entity doesn't have this field yet
      // employee.mobileVerification = true; // Entity doesn't have this field yet

      await this.employeeDetailsRepository.save(employee);
      this.logger.log(`Password reset successfully for employee: ${resetPasswordDto.loginId}`);
      
      return {
        message: 'Password successfully updated.',
        employeeId: employee.employeeId,
      };
    } catch (error) {
      this.logger.error(`Error resetting password: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Error resetting password: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
