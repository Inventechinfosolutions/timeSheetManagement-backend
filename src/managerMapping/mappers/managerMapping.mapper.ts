import { ManagerMappingDTO } from '../dto/managerMapping.dto';
import { ManagerMapping, ManagerMappingStatus } from '../entities/managerMapping.entity';

export class ManagerMappingMapper {
  static fromEntityToDTO(entity: ManagerMapping): ManagerMappingDTO | undefined {
    if (!entity) {
      return undefined;
    }

    const dto = new ManagerMappingDTO();
    dto.id = entity.id;

    dto.managerName = entity.managerName;
    dto.employeeId = entity.employeeId;
    dto.employeeName = entity.employeeName;
    dto.status = entity.status ? String(entity.status) : undefined;
    dto.department = entity.department || undefined;

    return dto;
  }

  static fromDTOtoEntity(dto: ManagerMappingDTO): ManagerMapping | undefined {
    if (!dto) {
      return undefined;
    }

    const entity = new ManagerMapping();
    if (dto.id) {
      entity.id = Number(dto.id);
    }

    entity.managerName = dto.managerName;
    entity.employeeId = dto.employeeId;
    entity.employeeName = dto.employeeName;
    entity.status = dto.status as ManagerMappingStatus;
    entity.department = dto.department ?? null;

    return entity;
  }
}
