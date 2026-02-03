import { RolePermissionDto } from '../dto/rolePermission.dto';
import { RolePermission } from '../entities/rolePermission.entity';

/**
 * Mapper for converting between RolePermission entity and DTO
 */
export class RolePermissionMapper {
  /**
   * Convert RolePermission entity to DTO
   */
  static fromEntityToDTO(entity: RolePermission): RolePermissionDto | undefined {
    if (!entity) {
      return undefined;
    }

    const dto = new RolePermissionDto();
    dto.id = entity.id;
    dto.roleId = entity.roleId;
    dto.permissionId = entity.permissionId;
    dto.valueYn = entity.valueYn;

    return dto;
  }

  /**
   * Convert RolePermission DTO to entity
   */
  static fromDTOtoEntity(dto: RolePermissionDto): RolePermission | undefined {
    if (!dto) {
      return undefined;
    }

    const entity = new RolePermission();
    if (dto.id) {
      entity.id = dto.id;
    }
    entity.roleId = dto.roleId;
    entity.permissionId = dto.permissionId;
    entity.valueYn = dto.valueYn;

    return entity;
  }
}
