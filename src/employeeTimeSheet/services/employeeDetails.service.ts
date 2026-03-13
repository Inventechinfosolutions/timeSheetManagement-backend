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
import { EmploymentType } from '../enums/employment-type.enum';
import { Gender } from '../enums/gender.enum';
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
import { ManagerMapping, ManagerMappingStatus } from '../../managerMapping/entities/managerMapping.entity';
import { EmployeeAttendance } from '../entities/employeeAttendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { TimesheetBlocker } from '../entities/timesheetBlocker.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { MonthStatus } from '../enums/month-status.enum';



@Injectable()
export class EmployeeDetailsService {
  private readonly logger = new Logger(EmployeeDetailsService.name);

  constructor(
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepository: Repository<ManagerMapping>,
    @InjectRepository(EmployeeAttendance)
    private readonly employeeAttendanceRepository: Repository<EmployeeAttendance>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(TimesheetBlocker)
    private readonly timesheetBlockerRepository: Repository<TimesheetBlocker>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly usersService: UsersService,
    private readonly employeeLinkService: EmployeeLinkService,
    private readonly documentUploaderService: DocumentUploaderService,
    private readonly employeeAttendanceService: EmployeeAttendanceService,
  ) { }

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

      const employee = this.employeeDetailsRepository.create({
        ...(employeeData as any),
        department: employeeData.department as Department,
        role: employeeData.role as UserType,
      }) as unknown as EmployeeDetails;
      const result = await this.employeeDetailsRepository.save(employee) as unknown as EmployeeDetails;

      // Also create User entity for authentication
      try {
        await this.usersService.create({
          loginId: result.employeeId,
          aliasLoginName: result.fullName,
          password: createEmployeeDetailsDto.password || 'Initial@123', // Admin can provide or it will be reset
          userType: createEmployeeDetailsDto.role ? (createEmployeeDetailsDto.role as UserType) : UserType.EMPLOYEE,
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
        employmentType: result.employmentType ?? undefined,
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

  async getDepartments(): Promise<string[]> {
    this.logger.log('Fetching all departments from enum');
    try {
      return Object.values(Department);
    } catch (error) {
      this.logger.error(`Error fetching departments: ${error.message}`);
      throw new HttpException('Failed to fetch departments', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getRoles(): Promise<string[]> {
    this.logger.log('Fetching all roles from enum');
    try {
      return Object.values(UserType);
    } catch (error) {
      this.logger.error(`Error fetching roles: ${error.message}`);
      throw new HttpException('Failed to fetch roles', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getStatuses(): Promise<string[]> {
    this.logger.log('Fetching all month statuses from enum');
    try {
      return Object.values(MonthStatus);
    } catch (error) {
      this.logger.error(`Error fetching monthly statuses: ${error.message}`);
      throw new HttpException('Failed to fetch monthly statuses', HttpStatus.INTERNAL_SERVER_ERROR);
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
    try {
      this.logger.log('Fetching employees with filter:', {
        search,
        sortBy,
        sortOrder,
        department,
        page,
        limit,
        managerName,
        managerId
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
        .leftJoin(User, 'user_filter', 'user_filter.loginId = employee.employeeId')
        .orderBy(`employee.${validSortBy}`, sortOrder);

      query.where('1=1');

      if (search) {
        query.andWhere(
          '(employee.fullName LIKE :search OR employee.employeeId LIKE :search)',
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
            mappingStatus: ManagerMappingStatus.ACTIVE,
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
          query.andWhere('mm.status = :status', { status: ManagerMappingStatus.ACTIVE });
          query.andWhere('employee.employeeId != :excludeManagerId', { excludeManagerId: managerId });
        }
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

  async getListSelect(
    department?: string,
    role?: string,
    search?: string,
  ): Promise<any[]> {
    try {
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
        if (roles.includes(UserType.EMPLOYEE)) {
          query.leftJoin(ManagerMapping, 'mm', 'mm.employeeId = employee.employeeId AND mm.status = :mappingStatus', { mappingStatus: ManagerMappingStatus.ACTIVE });

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

      const data = await query.getMany();

      return data.map((emp: any) => ({
        id: emp.id,
        fullName: emp.fullName,
        employeeId: emp.employeeId,
        department: emp.department,
        role: emp.role,
        userStatus: emp.user?.status || UserStatus.DRAFT,
      }));
    } catch (error) {
      this.logger.error(`Error fetching employee list select: ${error.message}`, error.stack);
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
    includeSelf: boolean = false,
  ): Promise<{ data: any[]; totalItems: number }> {
    try {
      this.logger.log('Fetching employees for timesheet list with filter:', {
        search,
        sortBy,
        sortOrder,
        department,
        page,
        limit,
        status,
        month,
        year,
        includeSelf
      });

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
        .leftJoin(User, 'user_filter', 'user_filter.loginId = employee.employeeId')
        .orderBy(`employee.${validSortBy}`, sortOrder);

      query.where('1=1');

      if (search) {
        query.andWhere(
          '(employee.fullName LIKE :search OR employee.employeeId LIKE :search)',
          { search: `%${search}%` },
        );
      }

      if (department && department !== 'All') {
        query.andWhere('employee.department = :department', { department });
      }

      // When viewing a specific month: show ACTIVE or INACTIVE only if inactiveDate is in that month (from next month onwards they disappear from list)
      const hasMonthYear = month != null && year != null && !Number.isNaN(Number(month)) && !Number.isNaN(Number(year));

      // Filter by Manager if provided
      if (managerName || managerId) {
        if (hasMonthYear) {
          const tsMonthStart = new Date(Number(year), Number(month) - 1, 1);
          query.andWhere(
            '(employee.userStatus = :activeStatus OR (employee.userStatus = :inactiveStatus AND employee.inactiveDate IS NOT NULL AND employee.inactiveDate >= :tsMonthStart))',
            {
              activeStatus: UserStatus.ACTIVE,
              inactiveStatus: UserStatus.INACTIVE,
              tsMonthStart: tsMonthStart,
            },
          );
        } else {
          // No month/year: only show ACTIVE employees (e.g. "All" or default list)
          query.andWhere('user_filter.status = :activeStatus', { activeStatus: UserStatus.ACTIVE });
        }

        if (includeSelf && managerId) {
          // Include the manager themselves OR those mapped to them
          query.leftJoin(ManagerMapping, 'mm', 'mm.employeeId = employee.employeeId');
          query.andWhere(
            `( 
              (mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery) 
              AND mm.status = :activeMappingStatus 
            ) OR (
              employee.employeeId = :exactManagerId
              AND (:searchEmpty = 1 OR employee.fullName LIKE :search OR employee.employeeId LIKE :search)
            )`,
            {
              managerNameQuery: `%${managerName}%`,
              managerIdQuery: `%${managerId}%`,
              activeMappingStatus: ManagerMappingStatus.ACTIVE,
              exactManagerId: managerId,
              searchEmpty: search ? 0 : 1,
              search: `%${search}%`,
            }
          );
        } else {
          // Exclude the manager themselves from their own list (standard for timesheets)
          if (managerId) {
            query.leftJoin(ManagerMapping, 'mm', 'mm.employeeId = employee.employeeId');
            query.andWhere(
              '(mm.managerName LIKE :managerNameQuery OR mm.managerName LIKE :managerIdQuery)',
              {
                managerNameQuery: `%${managerName}%`,
                managerIdQuery: `%${managerId}%`
              }
            );
            query.andWhere('mm.status = :status', { status: ManagerMappingStatus.ACTIVE });
            query.andWhere('employee.employeeId != :excludeManagerId', { excludeManagerId: managerId });
          }
        }
      } else if (hasMonthYear) {
        // Admin view with specific month: same rule – hide inactive from next month onwards
        const tsMonthStart = new Date(Number(year), Number(month) - 1, 1);
        query.andWhere(
          '(employee.userStatus = :activeStatus OR (employee.userStatus = :inactiveStatus AND employee.inactiveDate IS NOT NULL AND employee.inactiveDate >= :tsMonthStart))',
          {
            activeStatus: UserStatus.ACTIVE,
            inactiveStatus: UserStatus.INACTIVE,
            tsMonthStart: tsMonthStart,
          },
        );
      }

      if (status && status !== 'All') {
        query.andWhere('employee.monthStatus = :reqMonthStatus', { reqMonthStatus: status });
      }

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
        monthStatus: emp.monthStatus || MonthStatus.PENDING,
      }));

      return { data: enrichedData, totalItems };
    } catch (error) {
      this.logger.error(`Error fetching timesheet list: ${error.message}`, error.stack);
      throw new HttpException('Failed to fetch timesheet list', HttpStatus.INTERNAL_SERVER_ERROR);
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

      // Store original values for comparison
      const originalEmployeeId = employee.employeeId;
      const originalEmail = employee.email;
      const updatedEmployeeId = updateData.employeeId || originalEmployeeId;
      const updatedEmail = updateData.email || originalEmail;

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

      // Handle intern to full-timer conversion automatic date stamping
      if (
        updateFields.employmentType === EmploymentType.FULL_TIMER &&
        employee.employmentType === EmploymentType.INTERN &&
        !employee.conversionDate
      ) {
        employee.conversionDate = new Date();
        this.logger.log(`Employee ${employee.employeeId} converted to Full-Timer. Setting conversionDate to ${employee.conversionDate}`);
      }

      Object.assign(employee, {
        ...updateFields,
        department: updateFields.department as Department,
        role: updateFields.role as UserType,
      });
      const result = await this.employeeDetailsRepository.save(employee);

      // --- Synchronize related tables if employeeId or fullName changed ---
      const employeeIdChanged = updatedEmployeeId !== originalEmployeeId;
      const fullNameChanged = updateData.fullName && updateData.fullName !== employee.fullName;

      if (employeeIdChanged) {
        this.logger.log(`EmployeeId changed from ${originalEmployeeId} to ${updatedEmployeeId}. Synchronizing related tables.`);

        // Update ManagerMapping
        await this.managerMappingRepository.update({ employeeId: originalEmployeeId }, { employeeId: updatedEmployeeId });

        // Update EmployeeAttendance
        await this.employeeAttendanceRepository.update({ employeeId: originalEmployeeId }, { employeeId: updatedEmployeeId });

        // Update LeaveRequest
        await this.leaveRequestRepository.update({ employeeId: originalEmployeeId }, { employeeId: updatedEmployeeId });

        // Update TimesheetBlocker
        await this.timesheetBlockerRepository.update({ employeeId: originalEmployeeId }, { employeeId: updatedEmployeeId });

        // Update Notification
        await this.notificationRepository.update({ employeeId: originalEmployeeId }, { employeeId: updatedEmployeeId });

        this.logger.log(`Synchronization for employeeId ${updatedEmployeeId} completed.`);
      }

      if (fullNameChanged) {
        this.logger.log(`FullName changed for ${updatedEmployeeId}. Synchronizing ManagerMapping.`);

        // Update ManagerMapping where this employee is a subordinate
        await this.managerMappingRepository.update({ employeeId: updatedEmployeeId }, { employeeName: updateData.fullName });

        // Update ManagerMapping where this employee is a manager
        await this.managerMappingRepository.update({ managerName: employee.fullName }, { managerName: updateData.fullName });

        this.logger.log(`Synchronization for fullName ${updateData.fullName} completed.`);
      }
      // --------------------------------------------------------------------

      // Check if employeeId or email changed - if so, handle activation link
      const emailChanged = updatedEmail !== originalEmail;

      if (employeeIdChanged || emailChanged) {
        this.logger.log(
          `Employee ID or Email changed. EmployeeId: ${employeeIdChanged}, Email: ${emailChanged}. Processing activation link.`
        );

        // Fetch user details using the original employeeId (try both exact and lowercase for compatibility)
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
              `User loginId matches updated employeeId. Sending activation link with new password.`
            );
            try {
              const activationInfo = await this.employeeLinkService.generateActivationLink(updatedEmployeeId);

              // generateActivationLink updates both employee and user passwords
              // Reload employee to get the new password and verify user is synced
              const updatedEmployee = await this.employeeDetailsRepository.findOne({
                where: { employeeId: updatedEmployeeId },
              });
              const updatedUser = await this.userRepository.findOne({
                where: { loginId: updatedEmployeeId },
              });

              // Ensure user password matches employee password (only when employee has a password set)
              if (updatedEmployee && updatedUser && updatedEmployee.password != null && updatedEmployee.password !== updatedUser.password) {
                updatedUser.password = updatedEmployee.password;
                updatedUser.resetRequired = true; // Set resetRequired to true so user must change password
                await this.userRepository.save(updatedUser);
                this.logger.log(`User password synchronized and resetRequired set to true after activation link generation`);
              } else if (updatedUser) {
                // Even if passwords match, ensure resetRequired is true when new password is generated
                updatedUser.resetRequired = true;
                await this.userRepository.save(updatedUser);
                this.logger.log(`ResetRequired set to true for user: ${updatedEmployeeId}`);
              }

              this.logger.log(`Activation link sent to updated email: ${updatedEmail}`);
            } catch (linkError) {
              this.logger.warn(
                `Failed to send activation link: ${linkError.message}`
              );
            }
          } else {
            // Case 2: EmployeeId changed or case mismatch - update user.loginId to match exactly
            // Update user table with new employeeId as loginId (preserve case)
            // Then send activation link with updated employeeId to updated email
            this.logger.log(
              `EmployeeId changed or case mismatch. Updating user loginId from ${user.loginId} to ${updatedEmployeeId}`
            );

            // Update user loginId to new employeeId (preserve exact case)
            user.loginId = updatedEmployeeId;
            await this.userRepository.save(user);

            // Send activation link (will generate new password and update both employee and user tables)
            try {
              const activationInfo = await this.employeeLinkService.generateActivationLink(updatedEmployeeId);

              // generateActivationLink updates both employee and user passwords
              // Reload both to verify they're in sync
              const updatedEmployee = await this.employeeDetailsRepository.findOne({
                where: { employeeId: updatedEmployeeId },
              });
              const updatedUser = await this.userRepository.findOne({
                where: { loginId: updatedEmployeeId },
              });

              // Ensure user password matches employee password (only when employee has a password set)
              if (updatedEmployee && updatedUser && updatedEmployee.password != null && updatedEmployee.password !== updatedUser.password) {
                updatedUser.password = updatedEmployee.password;
                updatedUser.resetRequired = true; // Set resetRequired to true so user must change password
                await this.userRepository.save(updatedUser);
                this.logger.log(`User password synchronized and resetRequired set to true after employeeId change and activation link generation`);
              } else if (updatedUser) {
                // Even if passwords match, ensure resetRequired is true when new password is generated
                updatedUser.resetRequired = true;
                await this.userRepository.save(updatedUser);
                this.logger.log(`ResetRequired set to true for user: ${updatedEmployeeId}`);
              }

              this.logger.log(`Activation link sent to updated email: ${updatedEmail}`);
            } catch (linkError) {
              this.logger.warn(
                `Failed to send activation link: ${linkError.message}`
              );
            }
          }
        } else {
          // User doesn't exist - create user and send activation link
          this.logger.log(
            `User not found for employeeId: ${originalEmployeeId}. Creating user and sending activation link.`
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
            this.logger.log(`Activation link sent to updated email: ${updatedEmail}`);
          } catch (linkError) {
            this.logger.warn(
              `Failed to create user or send activation link: ${linkError.message}`
            );
          }
        }
      }

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

      // Update EmployeeDetails: set inactiveDate when marking INACTIVE, clear when ACTIVE
      employee.userStatus = status as UserStatus;
      if (status === UserStatus.INACTIVE) {
        employee.inactiveDate = new Date();
      } else if (status === UserStatus.ACTIVE) {
        employee.inactiveDate = null;
      }
      await this.employeeDetailsRepository.save(employee);

      // Update User entity
      // Map status string to UserStatus enum if possible
      let userStatus = UserStatus.ACTIVE;
      if (status === UserStatus.INACTIVE) {
        userStatus = UserStatus.INACTIVE;
      } else if (status === UserStatus.ACTIVE) {
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

      // Automatically remove any existing profile photo before uploading a new one
      try {
        await this.removeProfileImage(employeeId);
      } catch (e) {
        // If removal fails or no image exists, just log and continue
        this.logger.debug(`No previous profile image to cleanup for employee ${employeeId}`);
      }

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

  async removeProfileImage(employeeId: number): Promise<any> {
    try {
      this.logger.log(`Removing profile image for employee ID: ${employeeId}`);
      const docs = await this.getProfileImage(employeeId);
      if (!docs || docs.length === 0) {
        throw new NotFoundException('No profile image found to remove');
      }

      for (const doc of docs) {
        try {
          await this.documentUploaderService.deleteDoc(doc.key);
        } catch (error) {
          // If it's already not found, we consider it a win (it's gone).
          // Only log a warning instead of failing the whole thing.
          if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
            this.logger.warn(`Document ${doc.key} was already missing during removal for employee ${employeeId}`);
            continue;
          }
          throw error;
        }
      }

      this.logger.log(`Profile image(s) removed for employee ID: ${employeeId}`);
      return { message: 'Profile image removed successfully' };
    } catch (error) {
      this.logger.error(`Error removing profile image for employee ${employeeId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Error removing profile image', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getProfileImageStream(employeeId: number) {
    this.logger.log(`Fetching profile image stream for employee ID: ${employeeId}`);
    try {
      const docs = await this.getProfileImage(employeeId);
      if (!docs || docs.length === 0) {
        this.logger.warn(`No profile image found for employee ID: ${employeeId}`);
        throw new NotFoundException('No profile image found');
      }

      // Sort by creation date descending to get the latest
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const latest = docs[0];

      const stream = await this.documentUploaderService.downloadFile(latest.key);
      const meta = await this.documentUploaderService.getMetaData(latest.key);

      return { stream, meta };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof NotFoundException) throw error;
      const msg = error?.message || '';
      const isStorageUnavailable =
        msg.includes('ETIMEDOUT') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('connect ') ||
        msg.includes('ENOTFOUND') ||
        msg.includes('NetworkError');
      if (isStorageUnavailable) {
        this.logger.warn(`Profile image storage unavailable for employee ${employeeId}: ${msg}`);
        throw new HttpException(
          'Profile image storage temporarily unavailable. Please try again later.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      this.logger.error(`Error streaming profile image for employee ${employeeId}: ${error.message}`, error.stack);
      throw new HttpException('Error streaming profile image', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Parse Excel file and extract employee data
   */
  private parseExcelFile(buffer: Buffer): any[] {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON with header row; cellDates already applied in read()
      const data = XLSX.utils.sheet_to_json(worksheet);

      this.logger.log(`Parsed ${data.length} rows from Excel file`);
      return data;
    } catch (error) {
      this.logger.error(`Error parsing Excel file: ${error.message}`, error.stack);
      throw new BadRequestException('Invalid Excel file format');
    }
  }

  /**
   * Parse date from Excel: serial number, YYYY-MM-DD, dd/mm/yyyy, dd-mm-yyyy, or mm/dd/yyyy string.
   */
  private parseExcelDate(value: unknown): Date | null {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && !Number.isNaN(value)) {
      // Excel serial date: 1 = 1900-01-01 (Unix epoch offset ~25569)
      const date = new Date((value - 25569) * 86400 * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const str = String(value).trim();
    if (!str) return null;

    // YYYY-MM-DD (ISO) – parses reliably
    const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    // dd/mm/yyyy or dd-mm-yyyy (e.g. 09/06/2025 or 9-6-2025)
    const dmyMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(str);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    // Fallback: native parse (e.g. mm/dd/yyyy)
    const date = new Date(str);
    return Number.isNaN(date.getTime()) ? null : date;
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

          const departmentVal = String(rowData.department || '').trim();
          const employmentTypeVal = rowData.employmentType != null && String(rowData.employmentType).trim() !== ''
            ? (String(rowData.employmentType).trim().toUpperCase() as EmploymentType)
            : null;
          const genderVal = rowData.gender != null && String(rowData.gender).trim() !== ''
            ? (String(rowData.gender).trim().toUpperCase() as Gender)
            : null;
          const roleVal = rowData.role != null && String(rowData.role).trim() !== ''
            ? (String(rowData.role).trim().toUpperCase() as UserType)
            : null;
          const userStatusVal = rowData.userStatus != null && String(rowData.userStatus).trim() !== ''
            ? (String(rowData.userStatus).trim().toUpperCase().replace(' ', '_') as UserStatus)
            : UserStatus.ACTIVE;
          const joiningDateRaw = rowData.joiningDate ?? rowData.dateOfJoining ?? rowData['Joining Date'] ?? rowData['Date of Joining'];
          const conversionDateRaw = rowData.conversionDate ?? rowData['Conversion Date'] ?? rowData['Date of Conversion'];
          const joiningDateParsed = this.parseExcelDate(joiningDateRaw);
          const conversionDateParsed = this.parseExcelDate(conversionDateRaw);

          const employee = this.employeeDetailsRepository.create({
            fullName: String(rowData.fullName).trim(),
            employeeId: employeeId,
            department: departmentVal as Department,
            designation: String(rowData.designation).trim(),
            email: email,
            password: hashedPassword ?? null,
            employmentType: employmentTypeVal && Object.values(EmploymentType).includes(employmentTypeVal) ? employmentTypeVal : null,
            joiningDate: joiningDateParsed ?? undefined,
            conversionDate: conversionDateParsed ?? undefined,
            userStatus: Object.values(UserStatus).includes(userStatusVal) ? userStatusVal : UserStatus.ACTIVE,
            gender: genderVal && Object.values(Gender).includes(genderVal) ? genderVal : undefined,
            role: roleVal && Object.values(UserType).includes(roleVal) ? roleVal : undefined,
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
