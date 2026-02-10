/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, NotFoundException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { paginate, IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { Repository, In } from 'typeorm';

import { ManagerMappingDTO } from '../dto/managerMapping.dto';
import { ManagerMapping, ManagerMappingStatus } from '../entities/managerMapping.entity';
import { User } from '../../users/entities/user.entity';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerMappingMapper } from '../mappers/managerMapping.mapper';

@Injectable()
export class ManagerMappingService {
  private readonly logger = new Logger(ManagerMappingService.name);

  constructor(
    @InjectRepository(ManagerMapping)
    public readonly managerMappingRepository: Repository<ManagerMapping>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(
    options: IPaginationOptions,
    sortOrder: 'ASC' | 'DESC' = 'ASC',
    searchTerm?: string,
    status?: ManagerMappingStatus,
    managerName?: string,
  ): Promise<Pagination<ManagerMappingDTO>> {
    this.logger.log(`Fetching all ManagerMappings with pagination and search. Filter Manager: ${managerName || 'None'}`);
    try {
      const queryBuilder = this.managerMappingRepository.createQueryBuilder('managerMapping');

      // Join to users table to get employee status early for filtering
      queryBuilder
        .leftJoin(
          "users",
          "e_user",
          "managerMapping.employeeId = e_user.loginId",
        )
        .addSelect("e_user.status", "userStatus");

      // Apply filters
      if (status) {
        // Filter by the ACTUAL user status of the employee
        queryBuilder.andWhere('e_user.status = :status', { status });
      }

      if (managerName) {
        queryBuilder
          .leftJoin('employee_details', 'manager', 'managerMapping.managerName = manager.full_name') // Using leftJoin instead of join to avoid issues with missing details for some mappings
          .leftJoin('users', 'user', 'manager.employee_id = user.loginId')
          .andWhere(
            '(managerMapping.managerName = :managerName OR user.loginId = :managerName OR manager.employee_id = :managerName)',
            { managerName },
          )
          .andWhere('user.status = :activeStatus', { activeStatus: 'ACTIVE' });
      }

      // Add search functionality if searchTerm is provided
      if (searchTerm && searchTerm.trim()) {
        const term = `%${searchTerm.trim().toLowerCase()}%`;
        queryBuilder.andWhere(
          `(
            LOWER(managerMapping.manager_name) LIKE :term OR
            LOWER(managerMapping.employee_id) LIKE :term OR
            LOWER(managerMapping.employee_name) LIKE :term OR
            LOWER(COALESCE(managerMapping.department, '')) LIKE :term
          )`,
          { term },
        );
      }

      // Default sorting by id
      queryBuilder.orderBy("managerMapping.id", sortOrder);

      this.logger.debug(`SQL: ${queryBuilder.getSql()}`);
      this.logger.debug(
        `Query parameters: ${JSON.stringify(queryBuilder.getParameters())}`,
      );

      const totalMatching = await queryBuilder.getCount();
      this.logger.log(
        `Total matching rows (before pagination): ${totalMatching}`,
      );

      if (options && options.limit) {
        const limitNum = Number(options.limit) || 1;
        const requestedPage = Number(options.page) || 1;
        const totalPages = Math.ceil(totalMatching / limitNum);
        if (totalPages === 0) {
          options.page = 1;
        } else if (requestedPage > totalPages) {
          this.logger.log(
            `Requested page ${requestedPage} > totalPages ${totalPages}, clamping to ${totalPages}`,
          );
          options.page = totalPages;
        } else {
          options.page = requestedPage;
        }
      }

      // Add join to get managerId (loginId) for each mapping
      queryBuilder
        .leftJoin(
          "employee_details",
          "m_details",
          "managerMapping.managerName = m_details.full_name",
        )
        .leftJoin("users", "m_user", "m_details.employee_id = m_user.loginId")
        .addSelect("m_user.loginId", "managerId");

      const paginatedResult = await paginate<ManagerMapping>(
        queryBuilder,
        options,
      );
      // After pagination, we need to get the managerId for these items.
      const rawItems = await Promise.all(
        paginatedResult.items.map(async (entity) => {
          const dto = ManagerMappingMapper.fromEntityToDTO(entity);
          if (dto && managerName) {
            dto.managerId = managerName;
          }
          if (dto) {
            // Attach user status from raw query results if available, else fetch
            // Since we joined e_user early, we can use the count/select approach or a quick fetch
            const user = await this.userRepository.findOne({
              where: { loginId: entity.employeeId },
            });
            if (user) {
              dto.status = user.status;
            }
          }
          return dto;
        }),
      );

      const items = rawItems.filter(
        (item): item is ManagerMappingDTO => item !== undefined,
      );

      return {
        ...paginatedResult,
        items,
      };
    } catch (error) {
      this.logger.error('Error fetching ManagerMappings with pagination and search', error.stack);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findOne(id: number): Promise<ManagerMappingDTO> {
    this.logger.log(`Fetching ManagerMapping with id ${id}`);
    try {
      const entity = await this.managerMappingRepository.findOne({ where: { id } });
      if (!entity) {
        this.logger.warn(`ManagerMapping with id ${id} not found`);
        throw new NotFoundException(`ManagerMapping with id ${id} not found`);
      }
      const dto = ManagerMappingMapper.fromEntityToDTO(entity);
      if (!dto) {
        throw new HttpException('Failed to map entity to DTO', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return dto;
    } catch (error) {
      this.logger.error(`Error fetching ManagerMapping with id ${id}`, error.stack);
      if (error instanceof NotFoundException) throw error;
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async create(dto: ManagerMappingDTO): Promise<ManagerMappingDTO> {
    this.logger.log('Creating a new ManagerMapping');
    try {
      // Check if this manager is already mapped to another employee
      // Check if this employee is already mapped
      // Check if this employee is already mapped
      const mappingExists = await this.managerMappingRepository.findOne({
        where: { employeeId: dto.employeeId, status: ManagerMappingStatus.ACTIVE },
      });

      if (mappingExists) {
        // Check if the MANAGER of this mapping is active
        const managerDetails = await this.managerMappingRepository.manager.connection
             .createQueryBuilder()
             .select('user.status', 'status')
             .from('employee_details', 'ed')
             .innerJoin('users', 'user', 'ed.employee_id = user.loginId')
             .where('ed.full_name = :managerName', { managerName: mappingExists.managerName })
             .getRawOne();
             
        // If manager is ACTIVE, then block
        if (managerDetails && managerDetails.status === 'ACTIVE') {
           throw new HttpException(
             `Employee ${dto.employeeId} is already mapped to ${mappingExists.managerName}`,
             HttpStatus.BAD_REQUEST,
           );
        } else {
           // Manager is INACTIVE or not found, so we should deactivate the old mapping and allow new one
           this.logger.log(`Deactivating old mapping for ${dto.employeeId} because manager ${mappingExists.managerName} is inactive/missing`);
           mappingExists.status = ManagerMappingStatus.INACTIVE;
           await this.managerMappingRepository.save(mappingExists);
           // Proceed to create new mapping...
        }
      }

      const entity = ManagerMappingMapper.fromDTOtoEntity(dto);
      if (!entity) {
        throw new HttpException('Failed to convert DTO to entity', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Set default status to ACTIVE if not provided
      if (!entity.status) {
        entity.status = ManagerMappingStatus.ACTIVE;
      }

      const saved = await this.managerMappingRepository.save(entity);
      const savedEntity = Array.isArray(saved) ? saved[0] : saved;
      this.logger.log(`ManagerMapping created with id ${savedEntity.id}`);
      const savedDTO = ManagerMappingMapper.fromEntityToDTO(savedEntity);
      if (!savedDTO) {
        throw new HttpException('Failed to map saved entity to DTO', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return savedDTO;
    } catch (error) {
      this.logger.error('Error creating ManagerMapping', error.stack);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async update(id: number, dto: ManagerMappingDTO): Promise<ManagerMappingDTO> {
    this.logger.log(`Updating ManagerMapping with id ${id}`);
    try {
      const entity = await this.managerMappingRepository.findOne({ where: { id } });

      if (!entity) {
        this.logger.log(`ManagerMapping with id ${id} not found`);
        throw new NotFoundException(`ManagerMapping with id ${id} not found`);
      }

      Object.assign(entity, dto);

      const updated = await this.managerMappingRepository.save(entity);
      this.logger.log(`ManagerMapping updated with id ${updated.id}`);
      const updatedDTO = ManagerMappingMapper.fromEntityToDTO(updated);
      if (!updatedDTO) {
        throw new HttpException('Failed to map updated entity to DTO', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return updatedDTO;
    } catch (error) {
      this.logger.error(`Error updating ManagerMapping with id ${id}`, error.stack);
      if (error instanceof NotFoundException) throw error;
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async partialUpdate(id: string, updateData: Partial<ManagerMappingDTO>, loginId: string): Promise<ManagerMappingDTO> {
    this.logger.log(`User ${loginId} attempting partial update for ManagerMapping id: ${id}`);

    const entity = await this.managerMappingRepository.findOne({ where: { id: +id } });
    if (!entity) {
      this.logger.warn(`ManagerMapping with id ${id} not found`);
      throw new HttpException(`ManagerMapping with id ${id} not found`, HttpStatus.NOT_FOUND);
    }

    Object.assign(entity, updateData);

    // Track who updated
    (entity as any).updatedBy = loginId;
    (entity as any).updatedAt = new Date();

    const result = await this.managerMappingRepository.save(entity);

    this.logger.log(`ManagerMapping with id ${id} partially updated successfully`);
    const updatedDTO = ManagerMappingMapper.fromEntityToDTO(result);
    if (!updatedDTO) {
      throw new HttpException('Failed to map partially updated entity to DTO', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return updatedDTO;
  }

  async delete(id: number): Promise<void> {
    this.logger.log(`Deactivating ManagerMapping with id ${id}`);
    try {
      const entity = await this.managerMappingRepository.findOne({ where: { id } });
      if (!entity) {
        this.logger.warn(`ManagerMapping with id ${id} not found`);
        throw new NotFoundException(`ManagerMapping with id ${id} not found`);
      }

      // Instead of hard delete, mark as INACTIVE
      entity.status = ManagerMappingStatus.INACTIVE;
      await this.managerMappingRepository.save(entity);

      this.logger.log(`ManagerMapping deactivated (set to INACTIVE) with id ${id}`);
    } catch (error) {
      this.logger.error(`Error deactivating ManagerMapping with id ${id}`, error.stack);
      if (error instanceof NotFoundException) throw error;
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }



  async getMappingHistory(
    page: number = 1,
    limit: number = 10,
    search?: string,
    sortBy: string = 'createdAt',
    sortOrder: string = 'DESC',
    department?: string,
    status?: string
  ): Promise<any> {
    this.logger.log(`Fetching grouped Manager Mapping history with pagination. Search: ${search || 'None'}, Status: ${status || 'All'}, Page: ${page}`);
    try {
      const queryBuilder = this.managerMappingRepository.createQueryBuilder('managerMapping');
      
      queryBuilder
        .leftJoin(EmployeeDetails, 'manager', 'managerMapping.managerName = manager.fullName')
        .leftJoin(User, 'user', 'manager.employeeId = user.loginId')
        .leftJoin(User, 'e_user', 'managerMapping.employeeId = e_user.loginId')
        .select('managerMapping.managerName', 'managerName')
        .addSelect('managerMapping.department', 'department')
        .addSelect('MAX(user.status)', 'managerStatus')
        .addSelect("COUNT(CASE WHEN managerMapping.status = 'ACTIVE' AND e_user.status = 'ACTIVE' AND user.status = 'ACTIVE' THEN 1 END)", 'employeeCount')
        .addSelect('MAX(manager.employeeId)', 'managerEmployeeId')
        .addSelect('MAX(user.loginId)', 'loginId')
        .addSelect('MAX(managerMapping.createdAt)', 'createdAt')
        .groupBy('managerMapping.managerName')
        .addGroupBy('managerMapping.department');

      // Filters
      if (department && department !== 'All' && department !== 'All Departments') {
        queryBuilder.andWhere('managerMapping.department = :department', { department });
      }

      if (search && search.trim()) {
        const term = `%${search.trim().toLowerCase()}%`;
        queryBuilder.andWhere(
          `(LOWER(managerMapping.managerName) LIKE :term OR 
            LOWER(manager.employeeId) LIKE :term OR 
            LOWER(managerMapping.department) LIKE :term)`,
          { term }
        );
      }

      if (status && (status === 'ACTIVE' || status === 'INACTIVE')) {
        queryBuilder.having('MAX(user.status) = :status', { status });
      }

      // To get the total number of groups for pagination meta
      const countQuery = this.managerMappingRepository.createQueryBuilder('managerMapping')
        .leftJoin(EmployeeDetails, 'manager', 'managerMapping.managerName = manager.fullName')
        .select('managerMapping.managerName', 'managerName')
        .addSelect('managerMapping.department', 'department')
        .groupBy('managerMapping.managerName')
        .addGroupBy('managerMapping.department');

      if (department && department !== 'All' && department !== 'All Departments') {
        countQuery.andWhere('managerMapping.department = :department', { department });
      }
      if (search && search.trim()) {
        const term = `%${search.trim().toLowerCase()}%`;
        countQuery.andWhere(
          `(LOWER(managerMapping.managerName) LIKE :term OR 
            LOWER(manager.employeeId) LIKE :term OR 
            LOWER(managerMapping.department) LIKE :term)`,
          { term }
        );
      }

      if (status && (status === 'ACTIVE' || status === 'INACTIVE')) {
        countQuery
          .leftJoin(User, 'user', 'manager.employeeId = user.loginId')
          .having('MAX(user.status) = :status', { status });
      }

      const totalItemsResults = await countQuery.getRawMany();
      const totalItems = totalItemsResults.length;

      // Sorting
      const validSortFields = ['managerName', 'department', 'employeeCount', 'managerId', 'managerStatus', 'createdAt'];
      const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
      const actualSortOrder = (sortOrder.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';

      if (actualSortBy === 'managerId') {
        queryBuilder.orderBy('loginId', actualSortOrder);
      } else if (actualSortBy === 'managerStatus') {
        queryBuilder.orderBy('managerStatus', actualSortOrder);
      } else if (actualSortBy === 'employeeCount') {
        queryBuilder.orderBy('employeeCount', actualSortOrder);
      } else if (actualSortBy === 'department') {
        queryBuilder.orderBy('managerMapping.department', actualSortOrder);
      } else if (actualSortBy === 'createdAt') {
        queryBuilder.orderBy('createdAt', actualSortOrder);
      } else {
        queryBuilder.orderBy('managerMapping.managerName', actualSortOrder);
      }

      // Pagination
      const skip = (page - 1) * limit;
      const results = await queryBuilder
        .offset(skip)
        .limit(limit)
        .getRawMany();

      const items = results.map(r => ({
        managerName: r.managerName,
        managerId: r.loginId || r.managerEmployeeId || r.managerName,
        department: r.department,
        status: r.managerStatus || 'ACTIVE',
        employeeCount: parseInt(r.employeeCount, 10)
      }));

      return {
        items,
        meta: {
          totalItems,
          itemCount: items.length,
          itemsPerPage: limit,
          totalPages: Math.ceil(totalItems / limit),
          currentPage: page
        }
      };
    } catch (error) {
      this.logger.error('Error fetching mapping history', error.stack);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getMappedEmployeeIds(): Promise<string[]> {
    this.logger.log('Fetching all active mapped employee IDs (checking manager status)');
    try {
      const queryBuilder = this.managerMappingRepository.createQueryBuilder('managerMapping');
      
      const mappings = await queryBuilder
        .select('managerMapping.employeeId')
        .leftJoin(EmployeeDetails, 'manager', 'managerMapping.managerName = manager.fullName') // Join to get manager details
        .leftJoin(User, 'user', 'manager.employeeId = user.loginId') // Join to get manager user status
        .leftJoin(User, 'e_user', 'managerMapping.employeeId = e_user.loginId') // Join to get employee status
        .where('managerMapping.status = :mappingStatus', { mappingStatus: ManagerMappingStatus.ACTIVE })
        .andWhere('user.status = :managerUserStatus', { managerUserStatus: 'ACTIVE' }) // Only consider mapping active if manager is active
        .andWhere('e_user.status = :employeeUserStatus', { employeeUserStatus: 'ACTIVE' }) // Only consider mapping active if employee is active
        .getMany();

      return mappings.map((m) => m.employeeId);
    } catch (error) {
      this.logger.error('Error fetching mapped employee IDs', error.stack);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findByEmployeeId(employeeId: string): Promise<ManagerMappingDTO | null> {
    this.logger.log(`Fetching ManagerMapping for employeeId ${employeeId}`);
    try {
      const entity = await this.managerMappingRepository.findOne({
        where: { employeeId, status: ManagerMappingStatus.ACTIVE },
      });

      if (!entity) {
        this.logger.log(`No active ManagerMapping found for employeeId ${employeeId}`);
        return null;
      }

      const dto = ManagerMappingMapper.fromEntityToDTO(entity);
      if (!dto) {
        return null;
      }
      return dto;
    } catch (error) {
      this.logger.error(`Error fetching ManagerMapping for employeeId ${employeeId}`, error.stack);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
