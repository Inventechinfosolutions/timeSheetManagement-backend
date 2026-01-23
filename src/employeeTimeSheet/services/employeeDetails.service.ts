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
import { User } from '../../users/entities/user.entity';
import { EmployeeLinkService } from './employeeLink.service';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import * as XLSX from 'xlsx';
import { BulkUploadResultDto, BulkUploadErrorDto } from '../dto/bulk-upload-result.dto';



@Injectable()
export class EmployeeDetailsService {
  private readonly logger = new Logger(EmployeeDetailsService.name);

  constructor(
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly usersService: UsersService,
    private readonly employeeLinkService: EmployeeLinkService,
    private readonly documentUploaderService: DocumentUploaderService,
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
    search: string = '',
    sortBy: string = 'id',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    department?: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: EmployeeDetails[]; totalItems: number }> {
    try {
      this.logger.log('Fetching employees with filter:', {
        search,
        sortBy,
        sortOrder,
        department,
        page,
        limit,
      });

      // Validate sortBy field to prevent SQL injection
      const allowedSortFields = [
        'id',
        'fullName',
        'employeeId',
        'email',
        'department',
        'designation',
        'dateOfJoining',
        'createdAt',
        'updatedAt',
      ];

      const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'id';

      const query = this.employeeDetailsRepository
        .createQueryBuilder('employee')
        .orderBy(`employee.${validSortBy}`, sortOrder);

      query.where('1=1');

      if (search) {
        query.andWhere(
          '(employee.fullName LIKE :search OR employee.employeeId LIKE :search OR employee.email LIKE :search)',
          { search: `%${search}%` },
        );
      }

      if (department && department !== 'All') {
        query.andWhere('employee.department = :department', { department });
      }

      const [data, totalItems] = await query
        .skip((page - 1) * limit)
        .take(limit)
        .leftJoinAndMapOne('employee.user', User, 'user', 'user.loginId = employee.employeeId')
        .getManyAndCount();

      // Transform result to include user status fields
      const enrichedData = data.map((emp: any) => ({
        ...emp,
        userStatus: emp.user?.status || UserStatus.DRAFT,
        resetRequired: emp.user?.resetRequired ?? true,
        lastLoggedIn: emp.user?.lastLoggedIn || null,
        user: undefined // Remove the nested user object to keep response clean
      }));

      return { data: enrichedData, totalItems };
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
      const employee = await this.employeeDetailsRepository.createQueryBuilder('employee')
        .leftJoinAndMapOne('employee.user', User, 'user', 'user.loginId = employee.employeeId')
        .where('employee.id = :id', { id })
        .getOne();

      if (!employee) {
        this.logger.warn(`Employee with ID ${id} not found`);
        throw new NotFoundException(`Employee with ID ${id} not found`);
      }
      
      const result: any = employee;
      result.userStatus = result.user?.status || UserStatus.DRAFT;
      result.resetRequired = result.user?.resetRequired ?? true;
      result.lastLoggedIn = result.user?.lastLoggedIn || null;
      delete result.user;
      
      return result;
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

  async findByEmployeeId(employeeId: string): Promise<EmployeeDetails> {
    try {
      this.logger.log(`Fetching employee with string ID: ${employeeId}`);
      const employee = await this.employeeDetailsRepository.createQueryBuilder('employee')
        .leftJoinAndMapOne('employee.user', User, 'user', 'user.loginId = employee.employeeId')
        .where('employee.employeeId = :employeeId', { employeeId })
        .getOne();

      if (!employee) {
        this.logger.warn(`Employee ${employeeId} not found`);
        throw new NotFoundException(`Employee ${employeeId} not found`);
      }
      
      const result: any = employee;
      result.userStatus = result.user?.status || UserStatus.DRAFT;
      result.resetRequired = result.user?.resetRequired ?? true;
      result.lastLoggedIn = result.user?.lastLoggedIn || null;
      delete result.user;
      
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error fetching employee: ${error.message}`, error.stack);
      throw new HttpException('Failed to fetch employee', HttpStatus.INTERNAL_SERVER_ERROR);
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

  async updateStatus(
    employeeId: string,
    status: string
  ): Promise<any> {
    try {
        this.logger.log(`Updating status for employee ${employeeId} to ${status}`);
        const employee = await this.findByEmployeeId(employeeId);
        
        // Update EmployeeDetails
        employee.userStatus = status;
        await this.employeeDetailsRepository.save(employee);

        // Update User entity
        // Map status string to UserStatus enum if possible
        let userStatus = UserStatus.ACTIVE; 
        if (status === 'INACTIVE') {
            userStatus = UserStatus.INACTIVE;
        } else if (status === 'ACTIVE') {
            userStatus = UserStatus.ACTIVE;
        }

        const user = await this.userRepository.findOne({ where: { loginId: employeeId } });
        if (user) {
            user.status = userStatus;
            await this.userRepository.save(user);
        }

        return { message: 'Status updated successfully', status: employee.userStatus };

    } catch (error) {
        this.logger.error(`Error updating status: ${error.message}`, error.stack);
        if (error instanceof HttpException) throw error;
        throw new HttpException('Failed to update status', HttpStatus.INTERNAL_SERVER_ERROR);
    }
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
      
      // Update User entity if it exists
      const user = await this.userRepository.findOne({ where: { loginId: employee.employeeId.toLowerCase() } });
      if (user) {
        user.password = employee.password;
        user.resetRequired = false;
        await this.userRepository.save(user);
      }

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

  async resendActivationLink(employeeId: string): Promise<any> {
    try {
      this.logger.log(`Resending activation link for employee: ${employeeId}`);
      
      const employee = await this.findByEmployeeId(employeeId);
      
      // Check if user exists
      let user = await this.userRepository.findOne({ where: { loginId: employeeId.toLowerCase() } });
      
      if (!user) {
        // Create user if missing
        this.logger.warn(`User not found for ${employeeId}, creating new user record`);
        user = this.userRepository.create({
          loginId: employee.employeeId,
          aliasLoginName: employee.fullName,
          password: employee.password || 'Initial@123',
          userType: UserType.EMPLOYEE,
          status: UserStatus.DRAFT,
          resetRequired: true,
        });
        await this.userRepository.save(user);
      } else if (!user.resetRequired) {
        // If user already reset password/active, we shouldn't blindly resend activation link
        // unless explicitly requested to reset. but here we follow requirement: 
        // "resend button should go and that reset password should be visible to admin"
        // So this endpoint might arguably check user.resetRequired, but let's allow it 
        // and let frontend handle visibility.
      }

      const activationInfo = await this.employeeLinkService.generateActivationLink(employee.employeeId);
      this.logger.log(`Activation link regenerated for: ${employeeId}`);

      return {
        message: 'Activation link sent successfully',
        link: activationInfo.activationLink,
        loginId: activationInfo.loginId,
        password: activationInfo.password
      };
    } catch (error) {
      this.logger.error(`Error resending activation link: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to resend activation link', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  async uploadProfileImage(file: any, employeeId: number): Promise<any> {
    if (!file) {
        throw new BadRequestException('File is required');
    }
    try {
        const employee = await this.getEmployeeById(employeeId); // Validate existence
        
        const meta = new DocumentMetaInfo();
        meta.entityId = employeeId;
        meta.entityType = EntityType.EMPLOYEE;
        meta.refType = ReferenceType.EMPLOYEE_PROFILE_PHOTO;
        meta.refId = employeeId; // For profile pic, refId can be same as entityId or 0

        // Cast to any to satisfy the BufferedFile interface compatibility if needed
        return await this.documentUploaderService.uploadImage(file as any, meta);
    } catch (error) {
        if (error instanceof HttpException) throw error;
        this.logger.error(`Error uploading profile image: ${error.message}`, error.stack);
        throw new HttpException('Error uploading profile image', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getProfileImage(employeeId: number): Promise<any> {
      try {
          const docs = await this.documentUploaderService.getAllDocs(
              EntityType.EMPLOYEE, 
              employeeId, 
              ReferenceType.EMPLOYEE_PROFILE_PHOTO,
              employeeId
          );
          
          // Assuming we just want the latest one or list of them
          return docs;
      } catch (error) {
           if (error instanceof HttpException) throw error;
           this.logger.error(`Error fetching profile image: ${error.message}`, error.stack);
           throw new HttpException('Error fetching profile image', HttpStatus.INTERNAL_SERVER_ERROR);
      }
  }

  async getProfileImageStream(employeeId: number) {
    const docs = await this.getProfileImage(employeeId);
    if (!docs || docs.length === 0) {
      throw new HttpException('No profile image found', HttpStatus.NOT_FOUND);
    }
    
    // Sort by creation date descending to get the latest
    docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const latest = docs[0];

    const stream = await this.documentUploaderService.downloadFile(latest.key);
    const meta = await this.documentUploaderService.getMetaData(latest.key);
    
    return { stream, meta };
  }

  /**
   * Parse Excel file and extract employee data
   */
  private parseExcelFile(buffer: Buffer): any[] {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON with header row
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      this.logger.log(`Parsed ${data.length} rows from Excel file`);
      return data;
    } catch (error) {
      this.logger.error(`Error parsing Excel file: ${error.message}`, error.stack);
      throw new BadRequestException('Invalid Excel file format');
    }
  }

  /**
   * Validate employee data from Excel row
   */
  private validateEmployeeData(data: any, rowNumber: number): BulkUploadErrorDto[] {
    const errors: BulkUploadErrorDto[] = [];

    // Required fields validation
    const requiredFields = ['fullName', 'employeeId', 'department', 'designation', 'email'];
    
    for (const field of requiredFields) {
      if (!data[field] || String(data[field]).trim() === '') {
        errors.push({
          row: rowNumber,
          field,
          message: `${field} is required`
        });
      }
    }

    // Email format validation
    if (data.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(data.email).trim())) {
        errors.push({
          row: rowNumber,
          field: 'email',
          message: 'Invalid email format'
        });
      }
    }

    return errors;
  }


  /**
   * Bulk create employees from Excel file
   */
  /**
   * Bulk create employees from Excel file
   */
  async bulkCreateEmployees(file: Express.Multer.File): Promise<BulkUploadResultDto> {
    this.logger.log('Starting bulk employee upload');

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file type
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Please upload an Excel file (.xlsx or .xls)');
    }

    const result: BulkUploadResultDto = {
      successCount: 0,
      failureCount: 0,
      createdEmployees: [],
      errors: [],
      message: ''
    };

    try {
      // Parse Excel file
      const excelData = this.parseExcelFile(file.buffer);

      if (excelData.length === 0) {
        throw new BadRequestException('Excel file is empty');
      }

      // Process each row
      for (let i = 0; i < excelData.length; i++) {
        const rowNumber = i + 2; // +2 because Excel rows start at 1 and first row is header
        const rowData = excelData[i];

        // 1. Validate Basic Data Structure
        const rowErrors = this.validateEmployeeData(rowData, rowNumber);
        if (rowErrors.length > 0) {
          result.failureCount++;
          result.errors.push(...rowErrors);
          continue; // Skip to next row
        }

        const employeeId = String(rowData.employeeId).trim();
        const email = String(rowData.email).trim().toLowerCase();

        // 2. Check for Duplicates in Database (Individual Check)
        const existingEmployee = await this.employeeDetailsRepository.findOne({
          where: [
            { employeeId: employeeId },
            { email: email }
          ]
        });

        if (existingEmployee) {
          result.failureCount++;
          let msg = '';
          if (existingEmployee.employeeId === employeeId) msg += `Employee ID ${employeeId} already exists. `;
          if (existingEmployee.email === email) msg += `Email ${email} already exists.`;
          
          result.errors.push({
            row: rowNumber,
            message: msg.trim()
          });
          continue; // Skip to next row
        }

        // 3. Create Employee
        try {
          // Hash password if provided
          let hashedPassword: string | undefined;
          if (rowData.password) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(String(rowData.password).trim(), salt);
          }

          const employee = this.employeeDetailsRepository.create({
            fullName: String(rowData.fullName).trim(),
            employeeId: employeeId,
            department: String(rowData.department).trim(),
            designation: String(rowData.designation).trim(),
            email: email,
            password: hashedPassword,
          });

          const savedEmployee = await this.employeeDetailsRepository.save(employee);

          // Create User entity for authentication
          try {
            await this.usersService.create({
              loginId: savedEmployee.employeeId,
              aliasLoginName: savedEmployee.fullName,
              password: hashedPassword || 'Initial@123',
              userType: UserType.EMPLOYEE,
              status: UserStatus.DRAFT,
              resetRequired: true,
            });
          } catch (userError) {
            this.logger.warn(`Failed to create user for employee ${savedEmployee.employeeId}: ${userError.message}`);
            // Consider if this should be a failure or just a warning. 
            // Usually critical for login, but employee record IS created.
          }

          // Generate activation link
          try {
            await this.employeeLinkService.generateActivationLink(savedEmployee.employeeId);
          } catch (linkError) {
            this.logger.warn(`Failed to generate activation link for ${savedEmployee.employeeId}: ${linkError.message}`);
          }

          result.successCount++;
          result.createdEmployees.push(savedEmployee.employeeId);

        } catch (createError) {
          this.logger.error(`Error creating employee at row ${rowNumber}: ${createError.message}`);
          result.failureCount++;
          result.errors.push({
            row: rowNumber,
            message: createError.message || 'Failed to create employee'
          });
        }
      }

      // Set final message
      if (result.successCount > 0 && result.failureCount === 0) {
        result.message = `Successfully created all ${result.successCount} employee(s)`;
      } else if (result.successCount > 0 && result.failureCount > 0) {
        result.message = `Partially successful: ${result.successCount} created, ${result.failureCount} failed/skipped`;
      } else {
        result.message = `Failed to create employees. ${result.failureCount} errors found.`;
      }

      this.logger.log(`Bulk upload completed: ${result.successCount} success, ${result.failureCount} failures`);
      return result;

    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error in bulk upload: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to process bulk upload',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
