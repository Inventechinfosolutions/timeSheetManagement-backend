/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, NotFoundException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { paginate, IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { Repository, In } from 'typeorm';

import { ManagerMappingDTO } from '../dto/managerMapping.dto';
import { ManagerMapping, ManagerMappingStatus } from '../entities/managerMapping.entity';
import { User } from '../../users/entities/user.entity';
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

      // Apply filters
      if (status) {
        queryBuilder.andWhere('managerMapping.status = :status', { status });
      }

      if (managerName) {
        queryBuilder
          .leftJoin('employee_details', 'manager', 'managerMapping.managerName = manager.full_name') // Using leftJoin instead of join to avoid issues with missing details for some mappings
          .leftJoin('users', 'user', 'manager.employee_id = user.loginId')
          .andWhere(
            '(managerMapping.managerName = :managerName OR user.loginId = :managerName OR manager.employee_id = :managerName)',
            { managerName },
          );
      }

      // Add search functionality if searchTerm is provided
      let ignorePagination = false;
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
        ignorePagination = true;
      }

      // Default sorting by id
      queryBuilder.orderBy('managerMapping.id', sortOrder);

      this.logger.debug(`SQL: ${queryBuilder.getSql()}`);
      this.logger.debug(`Query parameters: ${JSON.stringify(queryBuilder.getParameters())}`);
      
      const totalMatching = await queryBuilder.getCount();
      this.logger.log(`Total matching rows (before pagination): ${totalMatching}`);

      if (!ignorePagination && options && options.limit) {
        const limitNum = Number(options.limit) || 1;
        const requestedPage = Number(options.page) || 1;
        const totalPages = Math.ceil(totalMatching / limitNum);
        if (totalPages === 0) {
          options.page = 1;
        } else if (requestedPage > totalPages) {
          this.logger.log(`Requested page ${requestedPage} > totalPages ${totalPages}, clamping to ${totalPages}`);
          options.page = totalPages;
        } else {
          options.page = requestedPage;
        }
      }

      // Add join to get managerId (loginId) for each mapping
      queryBuilder
        .leftJoin('employee_details', 'm_details', 'managerMapping.managerName = m_details.full_name')
        .leftJoin('users', 'm_user', 'm_details.employee_id = m_user.loginId')
        .addSelect('m_user.loginId', 'managerId');
      
      // Join to users table to get employee status
      queryBuilder
        .leftJoin('users', 'e_user', 'managerMapping.employeeId = e_user.loginId')
        .addSelect('e_user.status', 'userStatus');

      if (ignorePagination) {
        const raws = await queryBuilder.getRawMany();
        const items = raws.map((raw) => {
          const entity = this.managerMappingRepository.create({
            id: raw.managerMapping_id,
            managerName: raw.managerMapping_manager_name,
            employeeId: raw.managerMapping_employee_id,
            employeeName: raw.managerMapping_employee_name,
            status: raw.managerMapping_status,
            department: raw.managerMapping_department,
          });
          const dto = ManagerMappingMapper.fromEntityToDTO(entity);
          if (dto) {
             dto.managerId = raw.managerId;
             // Override status with user status if available
             if (raw.userStatus) {
                dto.status = raw.userStatus;
             }
          }
          return dto;
        }).filter(dto => dto !== undefined);

        return {
          items,
          meta: {
            totalItems: items.length,
            itemCount: items.length,
            itemsPerPage: items.length,
            totalPages: 1,
            currentPage: 1,
          },
          links: {},
        };
      } else {
        const paginatedResult = await paginate<ManagerMapping>(queryBuilder, options);
        // After pagination, we need to get the managerId for these items.
        // A simple way is to map them and if name is provided, use it, or fetch.
        // But for performance, let's just use the fact that we might have filtered by managerId.
        const rawItems = await Promise.all(paginatedResult.items.map(async (entity) => {
          const dto = ManagerMappingMapper.fromEntityToDTO(entity);
          if (dto && managerName) {
             dto.managerId = managerName; 
          }
          if (dto) {
             // Fetch user status
             const user = await this.userRepository.findOne({ where: { loginId: entity.employeeId } });
             if (user) {
                dto.status = user.status;
             }
          }
          return dto;
        }));
        
        const items = rawItems.filter((item): item is ManagerMappingDTO => item !== undefined);

        return {
          ...paginatedResult,
          items,
        };
      }
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



  async getMappingHistory(): Promise<any[]> {
    this.logger.log('Fetching grouped Manager Mapping history with Login ID');
    try {
      const queryBuilder = this.managerMappingRepository.createQueryBuilder('managerMapping');
      
      const results = await queryBuilder
        .leftJoin('employee_details', 'manager', 'managerMapping.managerName = manager.full_name')
        .leftJoin('users', 'user', 'manager.employee_id = user.loginId')
        .select('managerMapping.managerName', 'managerName')
        .addSelect('managerMapping.department', 'department')
        .addSelect('MAX(user.status)', 'managerStatus')
        .addSelect('COUNT(managerMapping.employeeId)', 'employeeCount')
        .addSelect('MAX(manager.employee_id)', 'managerEmployeeId')
        .addSelect('MAX(user.loginId)', 'loginId')
        .groupBy('managerMapping.managerName')
        .addGroupBy('managerMapping.department')
        .getRawMany();

      return results.map(r => ({
        managerName: r.managerName,
        managerId: r.loginId || r.managerEmployeeId || r.managerName,
        department: r.department,
        status: r.managerStatus || 'ACTIVE',
        employeeCount: parseInt(r.employeeCount, 10)
      }));
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
        .leftJoin('employee_details', 'manager', 'managerMapping.managerName = manager.full_name') // Join to get manager details
        .leftJoin('users', 'user', 'manager.employee_id = user.loginId') // Join to get manager user status
        .where('managerMapping.status = :mappingStatus', { mappingStatus: ManagerMappingStatus.ACTIVE })
        .andWhere('user.status = :managerUserStatus', { managerUserStatus: 'ACTIVE' }) // Only consider mapping active if manager is active
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
