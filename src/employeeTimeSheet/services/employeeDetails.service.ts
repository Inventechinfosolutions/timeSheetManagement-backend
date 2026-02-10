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
import { Department } from '../enums/department.enum';
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
import { EmployeeAttendanceService } from './employeeAttendance.service';
import { ManagerMapping } from '../../managerMapping/entities/managerMapping.entity';



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
    private readonly employeeAttendanceService: EmployeeAttendanceService,
  ) {}

    async createEmployee(
    createEmployeeDetailsDto: EmployeeDetailsDto,
  ): Promise<any> {
    const METHOD = 'createEmployee';
    this.logger.log(`[${METHOD}] Started creating new employee: ${createEmployeeDetailsDto.employeeId}`);

    try {
      // STEP 1: Check for duplicates (Employee ID)
      this.logger.debug(`[${METHOD}][STEP 1] Checking for duplicate Employee ID...`);
      const duplicateEmployeeId = await this.employeeDetailsRepository.findOne({
        where: { employeeId: createEmployeeDetailsDto.employeeId },
      });
      if (duplicateEmployeeId) {
        this.logger.warn(`[${METHOD}][STEP 1] Employee ID ${createEmployeeDetailsDto.employeeId} already exists`);
        throw new BadRequestException(
          `Employee ID ${createEmployeeDetailsDto.employeeId} is already registered`,
        );
      }

      // STEP 2: Check for duplicates (Email)
      this.logger.debug(`[${METHOD}][STEP 2] Checking for duplicate Email...`);
      const duplicateEmail = await this.employeeDetailsRepository.findOne({
        where: { email: createEmployeeDetailsDto.email },
      });
      if (duplicateEmail) {
        this.logger.warn(`[${METHOD}][STEP 2] Email ${createEmployeeDetailsDto.email} already exists`);
        throw new BadRequestException(
          `Email address ${createEmployeeDetailsDto.email} is already registered`,
        );
      }

      // STEP 3: Password Validation & Hashing
      this.logger.debug(`[${METHOD}][STEP 3] Validating and hashing password...`);
      /* eslint-disable @typescript-eslint/no-unused-vars */
      const { confirmPassword, ...employeeData } = createEmployeeDetailsDto;
      
      if (employeeData.password) {
        // Simple manual check if confirmPassword was in the DTO (though it's destructured out)
        // Note: The DTO might not strictly have confirmPassword in its type if not defined, 
        // but often it's passed in the body.
        // Assuming validation happens at DTO level or we trust the input.
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        employeeData.password = await bcrypt.hash(employeeData.password, salt);
      }

      // STEP 4: Create Employee Entity
      this.logger.debug(`[${METHOD}][STEP 4] Creating employee entity...`);
      const employee = this.employeeDetailsRepository.create({
        ...employeeData,
        department: employeeData.department as Department,
        role: employeeData.role as UserType,
      });
      
      const result = await this.employeeDetailsRepository.save(employee);
      this.logger.log(`[${METHOD}] Successfully saved employee details ID: ${result.id}`);

      // STEP 5: Create User Record
      this.logger.debug(`[${METHOD}][STEP 5] Creating associated User record...`);
      try {
        await this.usersService.create({
          loginId: result.employeeId,
          aliasLoginName: result.fullName,
          password: createEmployeeDetailsDto.password || 'Initial@123', // Use original password or default
          userType: createEmployeeDetailsDto.role ? (createEmployeeDetailsDto.role as UserType) : UserType.EMPLOYEE,
          status: UserStatus.DRAFT,
          resetRequired: true,
        });
        this.logger.log(`[${METHOD}][STEP 5] Associated user record created for: ${result.employeeId}`);
      } catch (userError) {
        this.logger.error(`[${METHOD}][STEP 5] Failed to create associated user record: ${userError.message}`);
        // We log but don't throw primarily to avoid rolling back the employee creation? 
        // Or should we throw? The original code didn't throw. We'll keep it as is.
      }

      // STEP 6: Generate Activation Link
      this.logger.debug(`[${METHOD}][STEP 6] Generating activation link...`);
      const activationInfo = await this.employeeLinkService.generateActivationLink(result.employeeId);

      this.logger.log(`[${METHOD}] Employee creation process completed for: ${result.employeeId}`);
      
      return {
          id: result.id,
          fullName: result.fullName,
          employeeId: result.employeeId,
          email: result.email,
          department: result.department,
          designation: result.designation,
          employmentType: result.employmentType ?? undefined,
          loginId: activationInfo.loginId,
          password: activationInfo.password,
          activationLink: activationInfo.activationLink,
          message: 'Employee registered successfully'
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`[${METHOD}] Failed to create employee. Error: ${error.message}`, error.stack);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async getDepartments(): Promise<string[]> {
    const METHOD = 'getDepartments';
    this.logger.log(`[${METHOD}] Fetching departments`);
    try {
      return Object.values(Department);
    } catch (error) {
      this.logger.error(`[${METHOD}] Failed to fetch departments: ${error.message}`, error.stack);
      throw new HttpException('Failed to fetch departments', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getRoles(): Promise<string[]> {
    const METHOD = 'getRoles';
    this.logger.log(`[${METHOD}] Fetching roles`);
    try {
      return Object.values(UserType);
    } catch (error) {
      this.logger.error(`[${METHOD}] Failed to fetch roles: ${error.message}`, error.stack);
      throw new HttpException('Failed to fetch roles', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getAllEmployees(
    search: string = '',
    sortBy: string = 'id',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    department?: string,
    page: number = 1,
    limit: number = 10,
    managerName?: string,
    managerId?: string,
    includeSelf: boolean = false,
    userStatus?: string,
  ): Promise<{ data: EmployeeDetails[]; totalItems: number }> {
    const METHOD = 'getAllEmployees';
    this.logger.log(`[${METHOD}] Fetching employees with search: "${search}", page: ${page}, limit: ${limit}`);

    try {
      // STEP 1: Sorting Validation
      this.logger.debug(`[${METHOD}][STEP 1] Validating sort field: ${sortBy}`);
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

      // STEP 2: Build Query
      this.logger.debug(`[${METHOD}][STEP 2] Building query...`);
      const query = this.employeeDetailsRepository
        .createQueryBuilder('employee')
        .leftJoin(User, 'user_filter', 'user_filter.loginId = employee.employeeId')
        .orderBy(`employee.${validSortBy}`, sortOrder);

      query.where('1=1');

      // STEP 3: Apply Filters
      this.logger.debug(`[${METHOD}][STEP 3] Applying filters (search, department, status, manager)...`);
      if (search) {
        query.andWhere(
          '(employee.fullName LIKE :search OR employee.employeeId LIKE :search OR employee.email LIKE :search)',
          { search: `%${search}%` },
        );
      }

      if (department && department !== 'All') {
        query.andWhere('employee.department = :department', { department });
      }

      if (userStatus) {
        query.andWhere('employee.userStatus = :userStatus', { userStatus });
      }

      // Filter by Manager if provided
      if (managerName || managerId) {
        // For managers, only show ACTIVE employees
        query.andWhere('user_filter.status = :activeStatus', { activeStatus: UserStatus.ACTIVE });

        query.leftJoin(ManagerMapping, 'mm', 'mm.employeeId = employee.employeeId');
        
        if (includeSelf) {
            // Include the manager themselves OR those mapped to them
            query.andWhere(
                '(employee.employeeId = :exactManagerId OR (mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery))', 
                { 
                    exactManagerId: managerId,
                    managerNameQuery: `%${managerName}%`, 
                    managerIdQuery: `%${managerId}%`
                }
            );
            
            // Ensure only active mappings are considered OR it's the manager themselves
            query.andWhere('(mm.status = :mappingStatus OR employee.employeeId = :exactManagerId)', { 
                mappingStatus: 'ACTIVE',
                exactManagerId: managerId 
            });
        } else {
            // Standard behavior: ONLY those mapped to them (exclude self)
            query.andWhere(
                '(mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery)', 
                { 
                    managerNameQuery: `%${managerName}%`, 
                    managerIdQuery: `%${managerId}%`
                }
            );
            query.andWhere('mm.status = :status', { status: 'ACTIVE' });
            query.andWhere('employee.employeeId != :excludeManagerId', { excludeManagerId: managerId });
        }
      }

      // STEP 4: Execute & Enrich
      this.logger.debug(`[${METHOD}][STEP 4] Executing query and enriching data...`);
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

      this.logger.log(`[${METHOD}] Successfully fetched ${enrichedData.length} employees`);
      return { data: enrichedData, totalItems };
    } catch (error) {
      this.logger.error(`[${METHOD}] Error fetching employees: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to fetch employees',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getListSelect(
    department?: string,
    role?: string,
    search?: string,
  ): Promise<any[]> {
    const METHOD = 'getListSelect';
    this.logger.log(`[${METHOD}] Fetching employee list for selection (Department: ${department || 'All'}, Role: ${role || 'Any'})`);

    try {
      // STEP 1: Build Query
      this.logger.debug(`[${METHOD}][STEP 1] Building selection query...`);
      const query = this.employeeDetailsRepository
        .createQueryBuilder('employee')
        .select([
          'employee.id',
          'employee.fullName',
          'employee.employeeId',
          'employee.department',
          'employee.role',
        ])
        .leftJoinAndMapOne('employee.user', User, 'user', 'user.loginId = employee.employeeId')
        .addSelect(['user.status']); 

      // STEP 2: Apply Filters
      this.logger.debug(`[${METHOD}][STEP 2] Applying filters...`);
      if (department && department !== 'All') {
        query.andWhere('employee.department = :department', { department });
      }

      // Filter to only include ACTIVE users
      query.andWhere('user.status = :activeStatus', { activeStatus: UserStatus.ACTIVE });

      // Add search filter
      if (search) {
        query.andWhere(
          '(employee.fullName LIKE :search OR employee.employeeId LIKE :search)',
          { search: `%${search}%` }
        );
      }

      if (role) {
        const roles = role.split(',');
        query.andWhere('employee.role IN (:...roles)', { roles });

        // If fetching employees, exclude those who are already mapped to a manager
        // UNLESS the manager they are mapped to is INACTIVE.
        if (roles.includes('EMPLOYEE')) {
             query.leftJoin(ManagerMapping, 'mm', 'mm.employeeId = employee.employeeId AND mm.status = :mappingStatus', { mappingStatus: 'ACTIVE' });
             
             // Join to check manager status using Entity classes
             query.leftJoin(EmployeeDetails, 'm_details', 'mm.managerName = m_details.fullName');
             query.leftJoin(User, 'm_user', 'm_details.employeeId = m_user.loginId');
             
             // Keep if:
             // 1. Not mapped at all (mm.id is NULL)
             // 2. Mapped, but manager is NOT Active (m_user.status != ACTIVE or NULL)
             query.andWhere(
               '(mm.id IS NULL OR m_user.status != :activeStatus OR m_user.status IS NULL)', 
               { activeStatus: UserStatus.ACTIVE }
             );
        }
      }
      
      // STEP 3: Execute & Transform
      this.logger.debug(`[${METHOD}][STEP 3] Executing search...`);
      const data = await query.getMany();

      this.logger.log(`[${METHOD}] Found ${data.length} employees for selection`);
      return data.map((emp: any) => ({
        id: emp.id,
        fullName: emp.fullName,
        employeeId: emp.employeeId,
        department: emp.department,
        role: emp.role,
        userStatus: emp.user?.status || UserStatus.DRAFT,
      }));
    } catch (error) {
      this.logger.error(`[${METHOD}] Error fetching employee list select: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to fetch employee list', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getTimesheetList(
    search: string = '',
    sortBy: string = 'id',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    department?: string,
    page: number = 1,
    limit: number = 10,
    status?: string,
    month?: number,
    year?: number,
    managerName?: string,
    managerId?: string,
  ): Promise<{ data: any[]; totalItems: number }> {
    const METHOD = 'getTimesheetList';
    this.logger.log(`[${METHOD}] Fetching timesheet list (Search: "${search}", Month: ${month}, Year: ${year})`);

    try {
      // STEP 1: Sorting Validation
      this.logger.debug(`[${METHOD}][STEP 1] Validating sort field...`);
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

      // STEP 2: Build Query
      this.logger.debug(`[${METHOD}][STEP 2] Building query...`);
      const query = this.employeeDetailsRepository
        .createQueryBuilder('employee')
        .leftJoin(User, 'user_filter', 'user_filter.loginId = employee.employeeId')
        .orderBy(`employee.${validSortBy}`, sortOrder);

      query.where('1=1');

      // STEP 3: Apply Filters
      this.logger.debug(`[${METHOD}][STEP 3] Applying filters...`);
      if (search) {
        query.andWhere(
          '(employee.fullName LIKE :search OR employee.employeeId LIKE :search OR employee.email LIKE :search)',
          { search: `%${search}%` },
        );
      }

      if (department && department !== 'All') {
        query.andWhere('employee.department = :department', { department });
      }

      // Filter by Manager if provided
      if (managerName || managerId) {
        // For managers, only show ACTIVE employees
        query.andWhere('user_filter.status = :activeStatus', { activeStatus: UserStatus.ACTIVE });
        
        // Exclude the manager themselves from their own list (Standard for timesheets)
        if (managerId) {
            query.andWhere('employee.employeeId != :excludeManagerId', { excludeManagerId: managerId });
        }

        query.innerJoin(ManagerMapping, 'mm', 'mm.employeeId = employee.employeeId');
        query.andWhere(
            '(mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery)', 
            { 
                managerNameQuery: `%${managerName}%`, 
                managerIdQuery: `%${managerId}%` 
            }
        );
        // Ensure only active mappings are considered
        query.andWhere('mm.status = :status', { status: 'ACTIVE' });
      }

      // STEP 4: Fetch Stats & Filter by Status
      this.logger.debug(`[${METHOD}][STEP 4] Fetching dashboard stats if required...`);
      let allStats: Record<string, any> = {};
      if (month && year) {
        allStats = await this.employeeAttendanceService.getAllDashboardStats(month.toString(), year.toString());
      }

      if (status && status !== 'All' && month && year) {
        this.logger.debug(`[${METHOD}][STEP 4] Filtering by month status: ${status}`);
        const filteredEmployeeIds = Object.keys(allStats).filter(empId => {
          const empStatus = allStats[empId].monthStatus === 'Completed' ? 'Submitted' : 'Pending';
          return empStatus === status;
        });

        if (filteredEmployeeIds.length > 0) {
          query.andWhere('employee.employeeId IN (:...filteredEmployeeIds)', { filteredEmployeeIds });
        } else {
          this.logger.log(`[${METHOD}] No employees match the status filter: ${status}`);
          return { data: [], totalItems: 0 };
        }
      }

      // STEP 5: Execute & Enrich
      this.logger.debug(`[${METHOD}][STEP 5] Finalizing query and enriching data...`);
      const [data, totalItems] = await query
        .skip((page - 1) * limit)
        .take(limit)
        .leftJoinAndMapOne('employee.user', User, 'user', 'user.loginId = employee.employeeId')
        .getManyAndCount();

      const enrichedData = data.map((emp: any) => ({
        id: emp.id,
        fullName: emp.fullName,
        employeeId: emp.employeeId,
        department: emp.department,
        designation: emp.designation,
        email: emp.email,
        userStatus: emp.user?.status || UserStatus.DRAFT,
        resetRequired: emp.user?.resetRequired ?? true,
        lastLoggedIn: emp.user?.lastLoggedIn || null,
        monthStatus: allStats[emp.employeeId]?.monthStatus || 'Pending',
      }));

      this.logger.log(`[${METHOD}] Successfully fetched ${enrichedData.length} records for timesheet list`);
      return { data: enrichedData, totalItems };
    } catch (error) {
      this.logger.error(`[${METHOD}] Error fetching timesheet list: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to fetch timesheet list', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getEmployeeById(id: number): Promise<EmployeeDetails> {
    const METHOD = 'getEmployeeById';
    this.logger.log(`[${METHOD}] Fetching employee ID: ${id}`);
    
    try {
      this.logger.debug(`[${METHOD}] Querying database...`);
      const employee = await this.employeeDetailsRepository.createQueryBuilder('employee')
        .leftJoinAndMapOne('employee.user', User, 'user', 'user.loginId = employee.employeeId')
        .where('employee.id = :id', { id })
        .getOne();

      if (!employee) {
        this.logger.warn(`[${METHOD}] Employee with ID ${id} not found`);
        throw new NotFoundException(`Employee with ID ${id} not found`);
      }
      
      this.logger.debug(`[${METHOD}] Enriching results...`);
      const result: any = employee;
      result.userStatus = result.user?.status || UserStatus.DRAFT;
      result.resetRequired = result.user?.resetRequired ?? true;
      result.lastLoggedIn = result.user?.lastLoggedIn || null;
      delete result.user;
      
      this.logger.log(`[${METHOD}] Found employee: ${result.fullName} (${result.employeeId})`);
      return result;
    } catch (error) {
      this.logger.error(`[${METHOD}] Error fetching employee: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to fetch employee',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findByEmployeeId(employeeId: string): Promise<EmployeeDetails> {
    const METHOD = 'findByEmployeeId';
    this.logger.log(`[${METHOD}] Fetching employee with string ID: ${employeeId}`);
    
    try {
      this.logger.debug(`[${METHOD}] Querying database...`);
      const employee = await this.employeeDetailsRepository.createQueryBuilder('employee')
        .leftJoinAndMapOne('employee.user', User, 'user', 'user.loginId = employee.employeeId')
        .where('employee.employeeId = :employeeId', { employeeId })
        .getOne();

      if (!employee) {
        this.logger.warn(`[${METHOD}] Employee ${employeeId} not found`);
        throw new NotFoundException(`Employee ${employeeId} not found`);
      }
      
      this.logger.debug(`[${METHOD}] Enriching results...`);
      const result: any = employee;
      result.userStatus = result.user?.status || UserStatus.DRAFT;
      result.resetRequired = result.user?.resetRequired ?? true;
      result.lastLoggedIn = result.user?.lastLoggedIn || null;
      delete result.user;
      
      this.logger.log(`[${METHOD}] Found employee: ${result.fullName}`);
      return result;
    } catch (error) {
      this.logger.error(`[${METHOD}] Error fetching employee: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to fetch employee', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }



  async updateEmployee(
    id: number,
    updateData: Partial<EmployeeDetailsDto>,
  ): Promise<EmployeeDetails> {
    const METHOD = 'updateEmployee';
    this.logger.log(`[${METHOD}] Started updating employee ID: ${id}`);

    try {
      // STEP 1: Fetch Existing Employee
      this.logger.debug(`[${METHOD}][STEP 1] Fetching employee details...`);
      const employee = await this.getEmployeeById(id);

      // Store original values for comparison
      const originalEmployeeId = employee.employeeId;
      const originalEmail = employee.email;
      const updatedEmployeeId = updateData.employeeId || originalEmployeeId;
      const updatedEmail = updateData.email || originalEmail;

      // STEP 2: Check for Duplicates (Employee ID)
      if (
        updateData.employeeId &&
        updateData.employeeId !== employee.employeeId
      ) {
        this.logger.debug(`[${METHOD}][STEP 2] Check for duplicate Employee ID...`);
        const duplicateEmployeeId = await this.employeeDetailsRepository.findOne({
          where: { employeeId: updateData.employeeId, id: Not(id) },
        });
        if (duplicateEmployeeId) {
          throw new BadRequestException(
            `Employee ID ${updateData.employeeId} is already registered`,
          );
        }
      }

      // STEP 3: Check for Duplicates (Email)
      if (updateData.email && updateData.email !== employee.email) {
        this.logger.debug(`[${METHOD}][STEP 3] Check for duplicate Email...`);
        const duplicateEmail = await this.employeeDetailsRepository.findOne({
          where: { email: updateData.email, id: Not(id) },
        });
        if (duplicateEmail) {
          throw new BadRequestException(
            `Email address ${updateData.email} is already registered`,
          );
        }
      }

      // STEP 4: Password Validation & Hashing
      /* eslint-disable @typescript-eslint/no-unused-vars */
      const { confirmPassword, ...updateFields } = updateData;

      if (updateFields.password) {
        this.logger.debug(`[${METHOD}][STEP 4] Updating password...`);
        if (updateData.confirmPassword && updateData.password !== updateData.confirmPassword) {
            throw new BadRequestException('Passwords do not match');
        }
        
        const salt = await bcrypt.genSalt(10);
        updateFields.password = await bcrypt.hash(updateFields.password, salt);
      }

      // STEP 5: Apply Updates & Save
      this.logger.debug(`[${METHOD}][STEP 5] Saving updates to database...`);
      Object.assign(employee, {
        ...updateFields,
        department: updateFields.department as Department,
        role: updateFields.role as UserType,
      });
      const result = await this.employeeDetailsRepository.save(employee);
      this.logger.log(`[${METHOD}] Successfully updated employee ID: ${result.id}`);

      // STEP 6: Handle Identity Changes (EmployeeID / Email)
      const employeeIdChanged = updatedEmployeeId !== originalEmployeeId;
      const emailChanged = updatedEmail !== originalEmail;

      if (employeeIdChanged || emailChanged) {
        this.logger.log(
          `[${METHOD}][STEP 6] Identity changed - EmployeeId: ${employeeIdChanged}, Email: ${emailChanged}. Processing user sync.`
        );

        // Fetch user details using the original employeeId
        let user = await this.userRepository.findOne({
          where: { loginId: originalEmployeeId },
        });
        if (!user) {
          user = await this.userRepository.findOne({
            where: { loginId: originalEmployeeId.toLowerCase() },
          });
        }

        if (user) {
          // Check if user.loginId matches the updated employeeId (case-insensitive comparison)
          const userLoginIdMatches = user.loginId.toLowerCase() === updatedEmployeeId.toLowerCase();
          
          if (userLoginIdMatches && user.loginId === updatedEmployeeId) {
            // Case 1: User loginId exactly matches updated employeeId (case-sensitive)
            // Send activation link with updated employeeId and new password
            this.logger.log(
              `[${METHOD}][STEP 6] User loginId matches updated employeeId. Sending activation link.`
            );
            try {
              await this.employeeLinkService.generateActivationLink(updatedEmployeeId);
              
              // generateActivationLink updates both employee and user passwords
              // Reload employee to get the new password and verify user is synced
              const updatedEmployee = await this.employeeDetailsRepository.findOne({
                where: { employeeId: updatedEmployeeId },
              });
              const updatedUser = await this.userRepository.findOne({
                where: { loginId: updatedEmployeeId },
              });
              
              // Ensure user password matches employee password
              if (updatedEmployee && updatedUser && updatedEmployee.password !== updatedUser.password) {
                updatedUser.password = updatedEmployee.password;
                updatedUser.resetRequired = true; // Set resetRequired to true so user must change password
                await this.userRepository.save(updatedUser);
                this.logger.log(`[${METHOD}][STEP 6] User password synchronized and resetRequired set to true`);
              } else if (updatedUser) {
                // Even if passwords match, ensure resetRequired is true when new password is generated
                updatedUser.resetRequired = true;
                await this.userRepository.save(updatedUser);
                this.logger.log(`[${METHOD}][STEP 6] ResetRequired set to true for user`);
              }
            } catch (linkError) {
              this.logger.error(`[${METHOD}][STEP 6] Failed to generate activation link: ${linkError.message}`);
            }
          } else {
            // Case 2: EmployeeId changed or case mismatch - update user.loginId to match exactly
            this.logger.log(
              `[${METHOD}][STEP 6] EmployeeId changed or case mismatch. Updating user loginId from ${user.loginId} to ${updatedEmployeeId}`
            );

            // Update user loginId to new employeeId (preserve exact case)
            user.loginId = updatedEmployeeId;
            await this.userRepository.save(user);

            // Send activation link (will generate new password and update both employee and user tables)
            try {
              await this.employeeLinkService.generateActivationLink(updatedEmployeeId);
              
              const updatedEmployee = await this.employeeDetailsRepository.findOne({
                where: { employeeId: updatedEmployeeId },
              });
              const updatedUser = await this.userRepository.findOne({
                where: { loginId: updatedEmployeeId },
              });
              
              if (updatedEmployee && updatedUser && updatedEmployee.password !== updatedUser.password) {
                updatedUser.password = updatedEmployee.password;
                updatedUser.resetRequired = true; 
                await this.userRepository.save(updatedUser);
                this.logger.log(`[${METHOD}][STEP 6] User password synchronized and resetRequired set to true after employeeId change`);
              } else if (updatedUser) {
                updatedUser.resetRequired = true;
                await this.userRepository.save(updatedUser);
                this.logger.log(`[${METHOD}][STEP 6] ResetRequired set to true for user: ${updatedEmployeeId}`);
              }
              
              this.logger.log(`[${METHOD}][STEP 6] Activation link sent to updated email: ${updatedEmail}`);
            } catch (linkError) {
              this.logger.warn(
                `[${METHOD}][STEP 6] Failed to send activation link: ${linkError.message}`
              );
            }
          }
        } else {
          // User doesn't exist - create user and send activation link
          this.logger.log(
            `[${METHOD}][STEP 6] User not found for employeeId: ${originalEmployeeId}. Creating user and sending activation link.`
          );
          try {
            // Create user if it doesn't exist (preserve exact case of employeeId)
            const newUser = this.userRepository.create({
              loginId: updatedEmployeeId, // Preserve exact case
              aliasLoginName: result.fullName,
              password: result.password || 'Initial@123',
              userType: UserType.EMPLOYEE,
              status: UserStatus.DRAFT,
              resetRequired: true,
            });
            await this.userRepository.save(newUser);

            // Send activation link
            await this.employeeLinkService.generateActivationLink(updatedEmployeeId);
            this.logger.log(`[${METHOD}][STEP 6] Activation link sent to updated email: ${updatedEmail}`);
          } catch (linkError) {
            this.logger.warn(
              `[${METHOD}][STEP 6] Failed to create user or send activation link: ${linkError.message}`
            );
          }
        }
      }

      this.logger.log(`[${METHOD}] Employee ${id} updated successfully`);
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`[${METHOD}] Failed to update employee: ${error.message}`, error.stack);
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
    const METHOD = 'updateStatus';
    this.logger.log(`[${METHOD}] Updating status for employee ${employeeId} to ${status}`);

    try {
        // STEP 1: Fetch Employee
        this.logger.debug(`[${METHOD}][STEP 1] Fetching employee details...`);
        const employee = await this.findByEmployeeId(employeeId);
        
        // STEP 2: Update EmployeeDetails
        this.logger.debug(`[${METHOD}][STEP 2] Updating employee status in database...`);
        employee.userStatus = status;
        await this.employeeDetailsRepository.save(employee);

        // STEP 3: Update Associated User entity
        this.logger.debug(`[${METHOD}][STEP 3] Updating associated user record status...`);
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
            this.logger.log(`[${METHOD}] Associated user record status synced to: ${userStatus}`);
        } else {
            this.logger.warn(`[${METHOD}] No associated user found for ${employeeId} to sync status`);
        }

        this.logger.log(`[${METHOD}] Status update completed for employee: ${employeeId}`);
        return { message: 'Status updated successfully', status: employee.userStatus };
    } catch (error) {
        this.logger.error(`[${METHOD}] Error updating status: ${error.message}`, error.stack);
        if (error instanceof HttpException) throw error;
        throw new HttpException('Failed to update status', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async deleteEmployee(id: number): Promise<void> {
    const METHOD = 'deleteEmployee';
    this.logger.log(`[${METHOD}] Started deleting employee ID: ${id}`);
    
    try {
      // STEP 1: Delete from Database
      this.logger.debug(`[${METHOD}][STEP 1] Removing employee record...`);
      const result = await this.employeeDetailsRepository.delete(id);
      
      // STEP 2: Verify Deletion
      if (result.affected === 0) {
        this.logger.warn(`[${METHOD}][STEP 2] Employee with ID ${id} not found`);
        throw new NotFoundException(`Employee with ID ${id} not found`);
      }
      
      this.logger.log(`[${METHOD}] Successfully deleted employee ID: ${id}`);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`[${METHOD}] Failed to delete employee: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to delete employee',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string; employeeId: string }> {
    const METHOD = 'resetPassword';
    this.logger.log(`[${METHOD}] Started resetting password for employee: ${resetPasswordDto.loginId}`);
    
    try {
      // STEP 1: Find Employee
      this.logger.debug(`[${METHOD}][STEP 1] Fetching employee details...`);
      const employee = await this.employeeDetailsRepository.findOne({
        where: { employeeId: resetPasswordDto.loginId },
      });

      if (!employee) {
        this.logger.warn(`[${METHOD}][STEP 1] Employee not found with ID: ${resetPasswordDto.loginId}`);
        throw new NotFoundException('Employee not found');
      }

      // STEP 2: Hash New Password
      this.logger.debug(`[${METHOD}][STEP 2] Hashing new password...`);
      const salt = await bcrypt.genSalt(10);
      employee.password = await bcrypt.hash(resetPasswordDto.password, salt);
      // employee.resetRequired = false; // Entity doesn't have this field yet
      // employee.mobileVerification = true; // Entity doesn't have this field yet

      await this.employeeDetailsRepository.save(employee);
      
      // STEP 3: Update User Entity
      this.logger.debug(`[${METHOD}][STEP 3] Updating associated user record...`);
      const user = await this.userRepository.findOne({ 
        where: { loginId: employee.employeeId.toLowerCase() } 
      });
      
      if (user) {
        user.password = employee.password;
        user.resetRequired = false;
        await this.userRepository.save(user);
        this.logger.log(`[${METHOD}][STEP 3] User password updated and resetRequired set to false`);
      } else {
         this.logger.warn(`[${METHOD}][STEP 3] No associated user found for ${employee.employeeId}`);
      }

      this.logger.log(`[${METHOD}] Password reset successfully for employee: ${resetPasswordDto.loginId}`);
      
      return {
        message: 'Password successfully updated.',
        employeeId: employee.employeeId,
      };
    } catch (error) {
      this.logger.error(`[${METHOD}] Error resetting password: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Error resetting password: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async resendActivationLink(employeeId: string): Promise<any> {
    const METHOD = 'resendActivationLink';
    this.logger.log(`[${METHOD}] Resending activation link for employee: ${employeeId}`);
    
    try {
      // STEP 1: Fetch Employee
      this.logger.debug(`[${METHOD}][STEP 1] Fetching employee details...`);
      const employee = await this.findByEmployeeId(employeeId);
      
      // STEP 2: Check User Existence
      this.logger.debug(`[${METHOD}][STEP 2] Verifying user record...`);
      let user = await this.userRepository.findOne({ where: { loginId: employeeId.toLowerCase() } });
      
      if (!user) {
        // Create user if missing
        this.logger.warn(`[${METHOD}][STEP 2] User not found for ${employeeId}, creating new user record`);
        user = this.userRepository.create({
          loginId: employee.employeeId,
          aliasLoginName: employee.fullName,
          password: employee.password || 'Initial@123',
          userType: UserType.EMPLOYEE,
          status: UserStatus.DRAFT,
          resetRequired: true,
        });
        await this.userRepository.save(user);
      } else {
        // Optional: Log status
        this.logger.debug(`[${METHOD}][STEP 2] User found, status: ${user.status}, resetRequired: ${user.resetRequired}`);
      }

      // STEP 3: Generate Link
      this.logger.debug(`[${METHOD}][STEP 3] Generating activation link...`);
      const activationInfo = await this.employeeLinkService.generateActivationLink(employee.employeeId);
      
      this.logger.log(`[${METHOD}] Activation link regenerated for: ${employeeId}`);

      return {
        message: 'Activation link sent successfully',
        link: activationInfo.activationLink,
        loginId: activationInfo.loginId,
        password: activationInfo.password
      };
    } catch (error) {
      this.logger.error(`[${METHOD}] Error resending activation link: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to resend activation link', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  async uploadProfileImage(file: any, employeeId: number): Promise<any> {
    const METHOD = 'uploadProfileImage';
    this.logger.log(`[${METHOD}] Uploading profile image for employee: ${employeeId}`);

    if (!file) {
        this.logger.warn(`[${METHOD}] No file provided for upload`);
        throw new BadRequestException('File is required');
    }
    try {
        // STEP 1: Validate Employee
        this.logger.debug(`[${METHOD}][STEP 1] Validating employee existence...`);
        await this.getEmployeeById(employeeId); 
        
        // STEP 2: Prepare Metadata
        this.logger.debug(`[${METHOD}][STEP 2] Preparing document metadata...`);
        const meta = new DocumentMetaInfo();
        meta.entityId = employeeId;
        meta.entityType = EntityType.EMPLOYEE;
        meta.refType = ReferenceType.EMPLOYEE_PROFILE_PHOTO;
        meta.refId = employeeId; 

        // STEP 3: Upload
        this.logger.debug(`[${METHOD}][STEP 3] Calling document uploader service...`);
        const result = await this.documentUploaderService.uploadImage(file as any, meta);
        
        this.logger.log(`[${METHOD}] Profile image uploaded successfully for employee: ${employeeId}`);
        return result;
    } catch (error) {
        this.logger.error(`[${METHOD}] Error uploading profile image: ${error.message}`, error.stack);
        if (error instanceof HttpException) throw error;
        throw new HttpException('Error uploading profile image', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getProfileImage(employeeId: number): Promise<any> {
    const METHOD = 'getProfileImage';
    this.logger.log(`[${METHOD}] Fetching profile image for employee: ${employeeId}`);

      try {
          const docs = await this.documentUploaderService.getAllDocs(
              EntityType.EMPLOYEE, 
              employeeId, 
              ReferenceType.EMPLOYEE_PROFILE_PHOTO,
              employeeId
          );
          
          this.logger.log(`[${METHOD}] Found ${docs.length} documents for employee: ${employeeId}`);
          return docs;
      } catch (error) {
           this.logger.error(`[${METHOD}] Error fetching profile image: ${error.message}`, error.stack);
           if (error instanceof HttpException) throw error;
           throw new HttpException('Error fetching profile image', HttpStatus.INTERNAL_SERVER_ERROR);
      }
  }

  async getProfileImageStream(employeeId: number) {
    const METHOD = 'getProfileImageStream';
    this.logger.log(`[${METHOD}] Downloading profile image stream for employee: ${employeeId}`);

    try {
      const docs = await this.getProfileImage(employeeId);
      if (!docs || docs.length === 0) {
        this.logger.warn(`[${METHOD}] No profile image found for employee: ${employeeId}`);
        throw new HttpException('No profile image found', HttpStatus.NOT_FOUND);
      }
      
      this.logger.debug(`[${METHOD}] Selecting latest image...`);
      // Sort by creation date descending to get the latest
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const latest = docs[0];

      this.logger.debug(`[${METHOD}] Fetching stream and metadata for key: ${latest.key}`);
      const stream = await this.documentUploaderService.downloadFile(latest.key);
      const meta = await this.documentUploaderService.getMetaData(latest.key);
      
      this.logger.log(`[${METHOD}] Successfully retrieved stream for employee: ${employeeId}`);
      return { stream, meta };
    } catch (error) {
      this.logger.error(`[${METHOD}] Error retrieving profile image stream: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Error retrieving profile image stream', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Parse Excel file and extract employee data
   */
  private parseExcelFile(buffer: Buffer): any[] {
    const METHOD = 'parseExcelFile';
    this.logger.log(`[${METHOD}] Parsing Excel buffer...`);

    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON with header row
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      this.logger.log(`[${METHOD}] Successfully parsed ${data.length} rows`);
      return data;
    } catch (error) {
      this.logger.error(`[${METHOD}] Error parsing Excel file: ${error.message}`, error.stack);
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
    const METHOD = 'bulkCreateEmployees';
    this.logger.log(`[${METHOD}] Starting bulk employee upload`);

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
      // STEP 1: Parse Excel File
      this.logger.debug(`[${METHOD}][STEP 1] Parsing Excel file...`);
      const excelData = this.parseExcelFile(file.buffer);

      if (excelData.length === 0) {
        throw new BadRequestException('Excel file is empty');
      }

      this.logger.log(`[${METHOD}][STEP 1] Found ${excelData.length} rows to process`);

      // STEP 2: Process Each Row
      for (let i = 0; i < excelData.length; i++) {
        const rowNumber = i + 2; // +2 because Excel rows start at 1 and first row is header
        const rowData = excelData[i];

        // Sub-step: Validate Basic Data Structure
        const rowErrors = this.validateEmployeeData(rowData, rowNumber);
        if (rowErrors.length > 0) {
          result.failureCount++;
          result.errors.push(...rowErrors);
          continue; // Skip to next row
        }

        const employeeId = String(rowData.employeeId).trim();
        const email = String(rowData.email).trim().toLowerCase();

        // Sub-step: Check for Duplicates in Database
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

        // Sub-step: Create Employee
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
            department: String(rowData.department).trim() as Department,
            designation: String(rowData.designation).trim(),
            email: email,
            password: hashedPassword,
          });

          const savedEmployee = await this.employeeDetailsRepository.save(employee);

          // Sub-step: Create User entity for authentication
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
            this.logger.warn(`[${METHOD}][Row ${rowNumber}] Failed to create user for employee ${savedEmployee.employeeId}: ${userError.message}`);
            // Consider if this should be a failure or just a warning. 
            // Usually critical for login, but employee record IS created.
          }

          // Sub-step: Generate activation link
          try {
            await this.employeeLinkService.generateActivationLink(savedEmployee.employeeId);
          } catch (linkError) {
            this.logger.warn(`[${METHOD}][Row ${rowNumber}] Failed to generate activation link for ${savedEmployee.employeeId}: ${linkError.message}`);
          }

          result.successCount++;
          result.createdEmployees.push(savedEmployee.employeeId);

        } catch (createError) {
          this.logger.error(`[${METHOD}][Row ${rowNumber}] Error creating employee: ${createError.message}`);
          result.failureCount++;
          result.errors.push({
            row: rowNumber,
            message: createError.message || 'Failed to create employee'
          });
        }
      }

      // STEP 3: Finalize Result
      if (result.successCount > 0 && result.failureCount === 0) {
        result.message = `Successfully created all ${result.successCount} employee(s)`;
      } else if (result.successCount > 0 && result.failureCount > 0) {
        result.message = `Partially successful: ${result.successCount} created, ${result.failureCount} failed/skipped`;
      } else {
        result.message = `Failed to create employees. ${result.failureCount} errors found.`;
      }
      
      this.logger.log(`[${METHOD}] Bulk upload completed. Success: ${result.successCount}, Failures: ${result.failureCount}`);
      return result;

    } catch (error) {
      this.logger.error(`[${METHOD}] Failed to process bulk upload: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to process bulk upload: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
