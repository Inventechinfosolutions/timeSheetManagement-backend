import { MasterHolidays } from '../models/master-holidays.entity';
import { CreateHolidayDto } from '../dto/create-holiday.dto';

export class MasterHolidayMapper {
  static toEntity(dto: CreateHolidayDto): MasterHolidays {
    const holiday = new MasterHolidays();
    holiday.date = new Date(dto.date);
    holiday.name = dto.name;
    return holiday;
  }

  static toResponseDto(entity: MasterHolidays) {
    return {
      id: entity.id,
      date: entity.date,
      name: entity.name,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      createdBy: entity.createdBy,
      updatedBy: entity.updatedBy,
    };
  }
}
