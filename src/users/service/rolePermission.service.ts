import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IPaginationOptions, paginate, Pagination } from 'nestjs-typeorm-paginate';
import { FindOneOptions, Repository } from 'typeorm';
import { RolePermissionDto } from '../dto/rolePermission.dto';
import { RolePermissionMapper } from '../mappers/rolePermission.mapper';
import { RolePermission } from '../entities/rolePermission.entity';

const relationshipNames = [];

/**
 * Service for managing role permissions
 */
@Injectable()
export class RolePermissionService {
  private readonly logger = new Logger(RolePermissionService.name);

  constructor(
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepository: Repository<RolePermission>,
  ) {}

  /**
   * Find a role permission by ID
   * @param id The ID of the role permission to find
   * @returns The found role permission DTO or undefined
   * @throws HttpException if role permission not found or on error
   */
  async findById(id: number): Promise<RolePermissionDto | undefined> {
    try {
      this.logger.log(`Finding role permission by id: ${id}`);
      const options = { relations: relationshipNames };
      const result = await this.rolePermissionRepository.findOne({
        where: { id },
        ...options,
      });

      if (!result) {
        throw new HttpException('Role permission not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`Successfully found role permission with id: ${id}`);
      return RolePermissionMapper.fromEntityToDTO(result);
    } catch (error) {
      this.logger.error(`Failed to find role permission by id: ${error.stack}`);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Find a role permission by specified fields
   * @param options The find options containing the fields to search by
   * @returns The found role permission DTO or undefined
   * @throws HttpException on error
   */
  async findByFields(options: FindOneOptions<RolePermission>): Promise<RolePermissionDto | undefined> {
    try {
      this.logger.log(`Finding role permission by fields: ${JSON.stringify(options)}`);
      const result = await this.rolePermissionRepository.findOne(options);
      if (!result) {
        return undefined;
      }
      this.logger.log('Successfully found role permission by fields');
      return RolePermissionMapper.fromEntityToDTO(result);
    } catch (error) {
      this.logger.error(`Failed to find role permission by fields: ${error.stack}`);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Find and count role permissions with pagination
   * @param options The pagination options
   * @returns Paginated list of role permission DTOs with metadata
   * @throws HttpException on error
   */
  async findAndCount(options: IPaginationOptions): Promise<Pagination<RolePermissionDto>> {
    try {
      this.logger.log(`Finding and counting role permissions with options: ${JSON.stringify(options)}`);

      const queryBuilder = this.rolePermissionRepository.createQueryBuilder('rolePermission');
      queryBuilder.orderBy('rolePermission.id', 'DESC');

      const page = await paginate<RolePermission>(queryBuilder, options);
      const dtos = page.items
        .map((item) => RolePermissionMapper.fromEntityToDTO(item))
        .filter((dto): dto is RolePermissionDto => dto !== undefined);

      const metadata = {
        totalItems: page.meta.totalItems,
        itemCount: page.meta.itemCount,
        itemsPerPage: page.meta.itemsPerPage,
        totalPages: page.meta.totalPages,
        currentPage: page.meta.currentPage,
      };

      this.logger.log(`Successfully found ${metadata.totalItems} role permissions`);
      return new Pagination<RolePermissionDto>(dtos, metadata, page.links);
    } catch (error) {
      this.logger.error(`Failed to find and count role permissions: ${error.stack}`);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Save a new role permission
   * @param rolePermissionDTO The role permission data to save
   * @param creator Optional creator username
   * @returns The saved role permission DTO
   * @throws HttpException if role permission already exists or on error
   */
  async save(rolePermissionDTO: RolePermissionDto, creator?: string): Promise<RolePermissionDto | undefined> {
    try {
      this.logger.log('Saving new role permission');
      const entity = RolePermissionMapper.fromDTOtoEntity(rolePermissionDTO);

      if (!entity) {
        throw new HttpException('Failed to convert DTO to entity', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      if (creator) {
        if (!entity.createdBy) {
          entity.createdBy = creator;
        }
        entity.updatedBy = creator;
      }

      const result = await this.rolePermissionRepository.save(entity);
      this.logger.log(`Successfully saved role permission with id: ${result.id}`);
      return RolePermissionMapper.fromEntityToDTO(result);
    } catch (error) {
      this.logger.error(`Failed to save role permission: ${error.stack}`);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Update an existing role permission
   * @param rolePermissionDTO The updated role permission data
   * @param updater Optional updater username
   * @param id The ID of the role permission to update
   * @returns The updated role permission DTO
   * @throws HttpException if role permission not found or on error
   */
  async update(
    rolePermissionDTO: RolePermissionDto,
    updater?: string,
    id?: number,
  ): Promise<RolePermissionDto | undefined> {
    try {
      this.logger.log(`Updating role permission with id: ${id}`);

      if (!id) {
        throw new HttpException('ID is required for update', HttpStatus.BAD_REQUEST);
      }

      const existingRolePermission = await this.rolePermissionRepository.findOne({ where: { id } });
      if (!existingRolePermission) {
        throw new HttpException('Role permission not found', HttpStatus.NOT_FOUND);
      }

      const entity = RolePermissionMapper.fromDTOtoEntity(rolePermissionDTO);
      
      if (!entity) {
        throw new HttpException('Failed to convert DTO to entity', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      
      entity.id = id;
      if (updater) {
        entity.updatedBy = updater;
      }

      const result = await this.rolePermissionRepository.save(entity);
      this.logger.log(`Successfully updated role permission with id: ${id}`);
      return RolePermissionMapper.fromEntityToDTO(result);
    } catch (error) {
      this.logger.error(`Failed to update role permission: ${error.stack}`);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Delete a role permission by ID
   * @param id The ID of the role permission to delete
   * @throws HttpException if role permission not found or on error
   */
  async deleteById(id: number): Promise<void> {
    try {
      this.logger.log(`Deleting role permission with id: ${id}`);

      const result = await this.rolePermissionRepository.delete(id);
      if (result.affected === 0) {
        throw new HttpException('Role permission not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`Successfully deleted role permission with id: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to delete role permission: ${error.stack}`);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Find permissions by role ID
   * @param roleId The ID of the role to find permissions for
   * @returns Array of role permission DTOs for the specified role
   * @throws HttpException on error
   */
  async findByRoleId(roleId: number): Promise<RolePermissionDto[]> {
    try {
      this.logger.log(`Finding permissions for role ID: ${roleId}`);

      const rolePermissions = await this.rolePermissionRepository.find({
        where: { roleId },
      });

      const dtos = rolePermissions
        .map((permission) => RolePermissionMapper.fromEntityToDTO(permission))
        .filter((dto): dto is RolePermissionDto => dto !== undefined);

      this.logger.log(`Successfully found ${dtos.length} permissions for role ID ${roleId}`);
      return dtos;
    } catch (error) {
      this.logger.error(`Failed to find permissions for role ID ${roleId}: ${error.stack}`);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
