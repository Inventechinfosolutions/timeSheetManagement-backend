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
    const METHOD = 'findAll';
    this.logger.log(`[${METHOD}] Fetching ManagerMappings (Manager: ${managerName || 'All'}, Search: "${searchTerm || ''}")`);
    
    try {
      // STEP 1: Build Query
      this.logger.debug(`[${METHOD}][STEP 1] Building query...`);
      const queryBuilder = this.managerMappingRepository.createQueryBuilder('managerMapping');

      queryBuilder
        .leftJoin("users", "e_user", "managerMapping.employeeId = e_user.loginId")
        .addSelect("e_user.status", "userStatus");

      // STEP 2: Apply Filters
      this.logger.debug(`[${METHOD}][STEP 2] Applying filters...`);
      if (status) {
        queryBuilder.andWhere('e_user.status = :status', { status });
      }

      if (managerName) {
        queryBuilder
          .leftJoin('employee_details', 'manager', 'managerMapping.managerName = manager.full_name') 
          .leftJoin('users', 'user', 'manager.employee_id = user.loginId')
          .andWhere(
            '(managerMapping.managerName = :managerName OR user.loginId = :managerName OR manager.employee_id = :managerName)',
            { managerName },
          )
          .andWhere('user.status = :activeStatus', { activeStatus: 'ACTIVE' });
      }

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

      queryBuilder.orderBy("managerMapping.id", sortOrder);

      // STEP 3: Handle Pagination Meta
      this.logger.debug(`[${METHOD}][STEP 3] Calculating pagination metadata...`);
      const totalMatching = await queryBuilder.getCount();
      if (options && options.limit) {
        const limitNum = Number(options.limit) || 1;
        const requestedPage = Number(options.page) || 1;
        const totalPages = Math.ceil(totalMatching / limitNum);
        if (totalPages === 0) {
          options.page = 1;
        } else if (requestedPage > totalPages) {
          options.page = totalPages;
        } else {
          options.page = requestedPage;
        }
      }

      // STEP 4: Execute & Map
      this.logger.debug(`[${METHOD}][STEP 4] Executing query and mapping results...`);
      queryBuilder
        .leftJoin("employee_details", "m_details", "managerMapping.managerName = m_details.full_name")
        .leftJoin("users", "m_user", "m_details.employee_id = m_user.loginId")
        .addSelect("m_user.loginId", "managerId");

      const paginatedResult = await paginate<ManagerMapping>(queryBuilder, options);
      
      const items = await Promise.all(
        paginatedResult.items.map(async (entity) => {
          const dto = ManagerMappingMapper.fromEntityToDTO(entity);
          if (dto) {
            if (managerName) dto.managerId = managerName;
            const user = await this.userRepository.findOne({ where: { loginId: entity.employeeId } });
            if (user) dto.status = user.status;
          }
          return dto;
        }),
      );

      this.logger.log(`[${METHOD}] Successfully fetched ${items.length} mapping records (Total: ${totalMatching})`);
      return {
        ...paginatedResult,
        items: items.filter((i): i is ManagerMappingDTO => i !== undefined),
      };
    } catch (error) {
      this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to fetch ManagerMappings', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findOne(id: number): Promise<ManagerMappingDTO> {
    const METHOD = 'findOne';
    this.logger.log(`[${METHOD}] Fetching ManagerMapping with ID: ${id}`);
    
    try {
      const entity = await this.managerMappingRepository.findOne({ where: { id } });
      if (!entity) {
        this.logger.warn(`[${METHOD}] Mapping ${id} not found`);
        throw new NotFoundException(`ManagerMapping with id ${id} not found`);
      }
      
      const dto = ManagerMappingMapper.fromEntityToDTO(entity);
      if (!dto) {
        throw new HttpException('Failed to map entity to DTO', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return dto;
    } catch (error) {
      this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) throw error;
      throw new HttpException('Failed to fetch mapping details', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async create(dto: ManagerMappingDTO): Promise<ManagerMappingDTO> {
    const METHOD = 'create';
    this.logger.log(`[${METHOD}] Started creating ManagerMapping for employee: ${dto.employeeId}`);
    
    try {
      // STEP 1: Check existing mapping for employee
      this.logger.debug(`[${METHOD}][STEP 1] Checking if employee ${dto.employeeId} is already mapped...`);
      const mappingExists = await this.managerMappingRepository.findOne({
        where: { employeeId: dto.employeeId, status: ManagerMappingStatus.ACTIVE },
      });

      if (mappingExists) {
        this.logger.warn(`[${METHOD}][STEP 1] existing mapping found for ${dto.employeeId} with manager ${mappingExists.managerName}`);
        
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
           this.logger.warn(`[${METHOD}][STEP 1] Current manager is ACTIVE. Cannot remap.`);
           throw new HttpException(
             `Employee ${dto.employeeId} is already mapped to ${mappingExists.managerName}`,
             HttpStatus.BAD_REQUEST,
           );
        } else {
           // Manager is INACTIVE or not found, so we should deactivate the old mapping and allow new one
           this.logger.log(`[${METHOD}][STEP 1] Deactivating old mapping because manager is inactive/missing`);
           mappingExists.status = ManagerMappingStatus.INACTIVE;
           await this.managerMappingRepository.save(mappingExists);
        }
      }

      // STEP 2: Convert DTO to Entity
      this.logger.debug(`[${METHOD}][STEP 2] Converting DTO to Entity...`);
      const entity = ManagerMappingMapper.fromDTOtoEntity(dto);
      if (!entity) {
        throw new HttpException('Failed to convert DTO to entity', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Set default status to ACTIVE if not provided
      if (!entity.status) {
        entity.status = ManagerMappingStatus.ACTIVE;
      }

      // STEP 3: Save to Database
      this.logger.debug(`[${METHOD}][STEP 3] Saving new mapping to database...`);
      const saved = await this.managerMappingRepository.save(entity);
      const savedEntity = Array.isArray(saved) ? saved[0] : saved;
      
      this.logger.log(`[${METHOD}] Successfully created ManagerMapping ID: ${savedEntity.id}`);
      
      // STEP 4: Convert back to DTO
      this.logger.debug(`[${METHOD}][STEP 4] robust mapping to response DTO...`);
      const savedDTO = ManagerMappingMapper.fromEntityToDTO(savedEntity);
      if (!savedDTO) {
        throw new HttpException('Failed to map saved entity to DTO', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return savedDTO;
    } catch (error) {
      this.logger.error(`[${METHOD}] Failed to create ManagerMapping. Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      if (error instanceof NotFoundException) throw error;
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async update(id: number, dto: ManagerMappingDTO): Promise<ManagerMappingDTO> {
    const METHOD = 'update';
    this.logger.log(`[${METHOD}] Started updating ManagerMapping ID: ${id}`);
    
    try {
      // STEP 1: Fetch Existing Mapping
      this.logger.debug(`[${METHOD}][STEP 1] Fetching mapping from database...`);
      const existing = await this.managerMappingRepository.findOne({ where: { id } });
      if (!existing) {
        this.logger.warn(`[${METHOD}][STEP 1] ManagerMapping with ID ${id} not found`);
        throw new NotFoundException(`ManagerMapping with id ${id} not found`);
      }

      // STEP 2: Update Fields
      this.logger.debug(`[${METHOD}][STEP 2] Updating fields...`);
      const entity = ManagerMappingMapper.fromDTOtoEntity(dto);
      
      if (!entity) {
        throw new HttpException('Failed to convert DTO to entity', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      
      entity.id = id; // Ensure ID is preserved

      // STEP 3: Save Changes
      this.logger.debug(`[${METHOD}][STEP 3] Saving updates to database...`);
      const updated = await this.managerMappingRepository.save(entity);
      
      this.logger.log(`[${METHOD}] Successfully updated ManagerMapping ID: ${updated.id}`);
      
      // STEP 4: Convert to DTO
      const resultDto = ManagerMappingMapper.fromEntityToDTO(updated);
      if (!resultDto) {
        throw new HttpException('Failed to map updated entity to DTO', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return resultDto;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`[${METHOD}] Failed to update ManagerMapping ${id}. Error: ${error.message}`, error.stack);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async partialUpdate(id: string, updateData: Partial<ManagerMappingDTO>, loginId: string): Promise<ManagerMappingDTO> {
    const METHOD = 'partialUpdate';
    this.logger.log(`[${METHOD}] User ${loginId} partially updating mapping ID: ${id}`);

    try {
      this.logger.debug(`[${METHOD}] Fetching existing mapping...`);
      const entity = await this.managerMappingRepository.findOne({ where: { id: +id } });
      if (!entity) {
        this.logger.warn(`[${METHOD}] Mapping ${id} not found`);
        throw new NotFoundException(`ManagerMapping with id ${id} not found`);
      }

      this.logger.debug(`[${METHOD}] Applying partial updates...`);
      Object.assign(entity, updateData);

      // Track who updated
      (entity as any).updatedBy = loginId;
      (entity as any).updatedAt = new Date();

      const result = await this.managerMappingRepository.save(entity);

      this.logger.log(`[${METHOD}] Mapping ${id} partially updated successfully`);
      const updatedDTO = ManagerMappingMapper.fromEntityToDTO(result);
      if (!updatedDTO) {
        throw new HttpException('Failed to map partially updated entity to DTO', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return updatedDTO;
    } catch (error) {
      this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException || error instanceof NotFoundException) throw error;
      throw new HttpException('Failed to partially update mapping', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async delete(id: number): Promise<void> {
    const METHOD = 'delete';
    this.logger.log(`[${METHOD}] Started deleting ManagerMapping ID: ${id}`);
    
    try {
      // STEP 1: Check existence
      this.logger.debug(`[${METHOD}][STEP 1] Checking if mapping exists...`);
      const existing = await this.managerMappingRepository.findOne({ where: { id } });
      if (!existing) {
        this.logger.warn(`[${METHOD}][STEP 1] ManagerMapping with ID ${id} not found`);
        throw new NotFoundException(`ManagerMapping with id ${id} not found`);
      }

      // STEP 2: Perform Delete
      this.logger.debug(`[${METHOD}][STEP 2] Deleting from database...`);
      await this.managerMappingRepository.delete(id);
      
      this.logger.log(`[${METHOD}] Successfully deleted ManagerMapping ID: ${id}`);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`[${METHOD}] Failed to delete ManagerMapping ${id}. Error: ${error.message}`, error.stack);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
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
    const METHOD = 'getMappingHistory';
    this.logger.log(`[${METHOD}] Fetching history (Search: "${search || ''}", Dept: ${department || 'All'}, Page: ${page})`);

    try {
      // STEP 1: Build Grouped Query
      this.logger.debug(`[${METHOD}][STEP 1] Building grouped query...`);
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

      // STEP 2: Apply Filters
      this.logger.debug(`[${METHOD}][STEP 2] Applying filters...`);
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

      // STEP 3: Count for Pagination
      this.logger.debug(`[${METHOD}][STEP 3] Counting total groups...`);
      const totalItemsResults = await queryBuilder.getRawMany();
      const totalItems = totalItemsResults.length;

      // STEP 4: Sorting & Pagination
      this.logger.debug(`[${METHOD}][STEP 4] Executing paginated query...`);
      const validSortFields = ['managerName', 'department', 'employeeCount', 'managerId', 'managerStatus', 'createdAt'];
      const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
      const actualSortOrder = (sortOrder.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';

      if (actualSortBy === 'managerId') queryBuilder.orderBy('loginId', actualSortOrder);
      else if (actualSortBy === 'managerStatus') queryBuilder.orderBy('managerStatus', actualSortOrder);
      else if (actualSortBy === 'employeeCount') queryBuilder.orderBy('employeeCount', actualSortOrder);
      else if (actualSortBy === 'department') queryBuilder.orderBy('managerMapping.department', actualSortOrder);
      else if (actualSortBy === 'createdAt') queryBuilder.orderBy('createdAt', actualSortOrder);
      else queryBuilder.orderBy('managerMapping.managerName', actualSortOrder);

      const skip = (page - 1) * limit;
      const results = await queryBuilder.offset(skip).limit(limit).getRawMany();

      const items = results.map(r => ({
        managerName: r.managerName,
        managerId: r.loginId || r.managerEmployeeId || r.managerName,
        department: r.department,
        status: r.managerStatus || 'ACTIVE',
        employeeCount: parseInt(r.employeeCount, 10)
      }));

      this.logger.log(`[${METHOD}] Successfully fetched ${items.length} history records`);
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
      this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to fetch mapping history', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getMappedEmployeeIds(): Promise<string[]> {
    const METHOD = 'getMappedEmployeeIds';
    this.logger.log(`[${METHOD}] Fetching all active mapped employee IDs...`);

    try {
      const queryBuilder = this.managerMappingRepository.createQueryBuilder('managerMapping');
      
      const mappings = await queryBuilder
        .select('managerMapping.employeeId')
        .leftJoin(EmployeeDetails, 'manager', 'managerMapping.managerName = manager.fullName') 
        .leftJoin(User, 'user', 'manager.employeeId = user.loginId') 
        .leftJoin(User, 'e_user', 'managerMapping.employeeId = e_user.loginId') 
        .where('managerMapping.status = :mappingStatus', { mappingStatus: ManagerMappingStatus.ACTIVE })
        .andWhere('user.status = :managerUserStatus', { managerUserStatus: 'ACTIVE' }) 
        .andWhere('e_user.status = :employeeUserStatus', { employeeUserStatus: 'ACTIVE' }) 
        .getMany();

      this.logger.log(`[${METHOD}] Found ${mappings.length} active mappings`);
      return mappings.map((m) => m.employeeId);
    } catch (error) {
      this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
      throw new HttpException('Failed to fetch mapped employee IDs', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findByEmployeeId(employeeId: string): Promise<ManagerMappingDTO | null> {
    const METHOD = 'findByEmployeeId';
    this.logger.log(`[${METHOD}] Fetching active mapping for employee: ${employeeId}`);

    try {
      const entity = await this.managerMappingRepository.findOne({
        where: { employeeId, status: ManagerMappingStatus.ACTIVE },
      });

      if (!entity) {
        this.logger.debug(`[${METHOD}] No active mapping found for ${employeeId}`);
        return null;
      }

      const dto = ManagerMappingMapper.fromEntityToDTO(entity);
      return dto || null;
    } catch (error) {
      this.logger.error(`[${METHOD}] Error: ${error.message}`, error.stack);
      throw new HttpException('Failed to fetch mapping by employee ID', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
