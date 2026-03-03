import { Injectable, Logger, ConflictException, InternalServerErrorException, NotFoundException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MasterHolidays } from '../models/master-holidays.entity';
import { CreateHolidayDto } from '../dto/create-holiday.dto';
import { UpdateHolidayDto } from '../dto/update-holiday.dto';
import { MasterHolidayMapper } from '../mappers/master-holiday.mapper';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';

@Injectable()
export class MasterHolidayService {
  private readonly logger = new Logger(MasterHolidayService.name);

  constructor(
    @InjectRepository(MasterHolidays)
    private readonly holidayRepository: Repository<MasterHolidays>,
    private readonly documentUploaderService: DocumentUploaderService,
  ) { }

  async create(createHolidayDto: CreateHolidayDto): Promise<any> {
    this.logger.log(`Starting creation of new holiday: ${createHolidayDto.name}`);
    try {
      const holiday = MasterHolidayMapper.toEntity(createHolidayDto);
      const savedHoliday = await this.holidayRepository.save(holiday);
      this.logger.log(`Successfully created holiday: ${createHolidayDto.name} with ID: ${savedHoliday.id}`);
      return MasterHolidayMapper.toResponseDto(savedHoliday);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
        this.logger.warn(`Failed to create holiday: Holiday already exists for date ${createHolidayDto.date}`);
        throw new ConflictException('Holiday already exists for this date');
      }
      this.logger.error(`Error creating holiday: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to create holiday: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async createBulk(createHolidayDtos: CreateHolidayDto[]): Promise<any[]> {
    this.logger.log(`Starting bulk creation of ${createHolidayDtos.length} holidays`);
    try {
      const holidays = createHolidayDtos.map(dto => MasterHolidayMapper.toEntity(dto));
      const savedHolidays = await this.holidayRepository.save(holidays);
      this.logger.log(`Successfully created ${savedHolidays.length} holidays in bulk`);
      return savedHolidays.map(holiday => MasterHolidayMapper.toResponseDto(holiday));
    } catch (error) {
      this.logger.error(`Failed to create bulk holidays: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to create bulk holidays: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async uploadDocument(
    documents: Express.Multer.File[],
    refType: ReferenceType,
    refId: number,
    entityType: EntityType,
    entityId: number,
  ) {
    this.logger.log(`Starting document upload for holiday ID: ${entityId}. Count: ${documents.length}`);
    try {
      const uploadPromises = documents.map(async (doc) => {
        const details = new DocumentMetaInfo();
        details.refId = refId;
        details.refType = refType;
        details.entityId = entityId;
        details.entityType = entityType;

        return await this.documentUploaderService.uploadImage(doc, details);
      });

      const results = await Promise.all(uploadPromises);
      this.logger.log(`Successfully uploaded ${results.length} document(s) for holiday ID: ${entityId}`);

      return {
        success: true,
        message: 'Documents uploaded successfully',
        data: results,
      };
    } catch (error) {
      this.logger.error(`Failed to upload documents for holiday ${entityId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to upload documents: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getAllFiles(entityType: EntityType, entityId: number, refId: number, referenceType: ReferenceType) {
    this.logger.log(`Fetching all files for entity Type: ${entityType}, ID: ${entityId}`);
    try {
      return await this.documentUploaderService.getAllDocs(entityType, entityId, referenceType, refId);
    } catch (error) {
      this.logger.error(`Failed to fetch documents for entity ${entityId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch documents: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async deleteDocument(entityType: EntityType, entityId: number, refId: number, key: string) {
    this.logger.log(`Starting deletion of document with key: ${key} for entity ID: ${entityId}`);
    try {
      await this.validateEntity(entityType, entityId, refId);
      await this.documentUploaderService.deleteDoc(key);
      this.logger.log(`Successfully deleted document: ${key}`);

      return {
        success: true,
        message: 'Document deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to delete document ${key}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to delete document: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async validateEntity(entityType: EntityType, entityId: number, refId: number) {
    try {
      if (entityType === EntityType.MASTER_HOLIDAY) {
        const holiday = await this.holidayRepository.findOne({ where: { id: entityId } });
        if (!holiday) {
          throw new NotFoundException(`Holiday with ID ${entityId} not found`);
        }
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Entity validation failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findAll(): Promise<any[]> {
    this.logger.log('Fetching all holidays');
    try {
      const holidays = await this.holidayRepository.find({
        order: { date: 'ASC' }
      });
      this.logger.log(`Retrieved ${holidays.length} holidays`);
      return holidays.map(holiday => MasterHolidayMapper.toResponseDto(holiday));
    } catch (error) {
      this.logger.error(`Failed to fetch holidays: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch holidays: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findOne(id: number): Promise<any> {
    this.logger.log(`Fetching holiday with ID: ${id}`);
    try {
      const holiday = await this.holidayRepository.findOne({ where: { id } });

      if (!holiday) {
        this.logger.warn(`Holiday fetch failed: ID ${id} not found`);
        throw new NotFoundException(`Holiday with ID ${id} not found`);
      }

      return MasterHolidayMapper.toResponseDto(holiday);
    } catch (error) {
      this.logger.error(`Failed to fetch holiday ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch holiday: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findByDateRange(fromDate: string, toDate: string): Promise<any[]> {
    this.logger.log(`Fetching holidays from ${fromDate} to ${toDate}`);
    try {
      const holidays = await this.holidayRepository
        .createQueryBuilder('holiday')
        .where('holiday.date >= :fromDate', { fromDate })
        .andWhere('holiday.date <= :toDate', { toDate })
        .orderBy('holiday.date', 'ASC')
        .getMany();

      this.logger.log(`Retrieved ${holidays.length} holidays within range`);
      return holidays.map(holiday => MasterHolidayMapper.toResponseDto(holiday));
    } catch (error) {
      this.logger.error(`Failed to fetch holidays by range: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch holidays by range: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findByMonth(month: number): Promise<any[]> {
    this.logger.log(`Fetching holidays for month: ${month}`);
    try {
      const holidays = await this.holidayRepository
        .createQueryBuilder('holiday')
        .where('MONTH(holiday.date) = :month', { month })
        .orderBy('holiday.date', 'ASC')
        .getMany();
      this.logger.log(`Retrieved ${holidays.length} holidays for month ${month}`);
      return holidays.map(holiday => MasterHolidayMapper.toResponseDto(holiday));
    } catch (error) {
      this.logger.error(`Failed to fetch holidays by month: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch holidays by month: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findByMonthAndYear(month: number, year: number): Promise<any[]> {
    this.logger.log(`Fetching holidays for month: ${month}, year: ${year}`);
    try {
      const holidays = await this.holidayRepository
        .createQueryBuilder('holiday')
        .where('MONTH(holiday.date) = :month', { month })
        .andWhere('YEAR(holiday.date) = :year', { year })
        .orderBy('holiday.date', 'ASC')
        .getMany();
      this.logger.log(`Retrieved ${holidays.length} holidays for ${month}/${year}`);
      return holidays.map(holiday => MasterHolidayMapper.toResponseDto(holiday));
    } catch (error) {
      this.logger.error(`Failed to fetch holidays by month and year: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch holidays by month and year: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getYearWeekends(year: number): Promise<any[]> {
    this.logger.log(`Calculating weekends for year: ${year}`);
    try {
      const weekends: any[] = [];
      for (let month = 0; month < 12; month++) {
        const date = new Date(year, month, 1);

        while (date.getMonth() === month) {
          const day = date.getDay();
          if (day === 0 || day === 6) { // 0 is Sunday, 6 is Saturday
            weekends.push({
              date: new Date(date),
              name: day === 0 ? 'Sunday' : 'Saturday',
            });
          }
          date.setDate(date.getDate() + 1);
        }
      }
      this.logger.log(`Calculated ${weekends.length} weekend days for year ${year}`);
      return weekends;
    } catch (error) {
      this.logger.error(`Failed to calculate weekends for year ${year}: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to calculate weekends: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  isWeekend(date: Date): boolean {
    const day = date.getDay();
    // 0 is Sunday, 6 is Saturday
    return day === 0 || day === 6;
  }

  async findByDate(date: string): Promise<any> {
    this.logger.log(`Fetching holiday for date: ${date}`);
    try {
      const holiday = await this.holidayRepository
        .createQueryBuilder('holiday')
        .where('holiday.date = :date', { date })
        .getOne();

      if (!holiday) {
        this.logger.debug(`No holiday found for date: ${date}`);
        return null;
      }

      return MasterHolidayMapper.toResponseDto(holiday);
    } catch (error) {
      this.logger.error(`Failed to fetch holiday by date ${date}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch holiday by date: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async update(id: number, updateHolidayDto: UpdateHolidayDto): Promise<any> {
    this.logger.log(`Starting update for holiday ID: ${id}`);
    try {
      const holiday = await this.holidayRepository.findOne({ where: { id } });

      if (!holiday) {
        this.logger.warn(`Update failed: Holiday ID ${id} not found`);
        throw new NotFoundException(`Holiday with ID ${id} not found`);
      }

      if (updateHolidayDto.date) holiday.date = new Date(updateHolidayDto.date);
      if (updateHolidayDto.name) holiday.name = updateHolidayDto.name;

      const updatedHoliday = await this.holidayRepository.save(holiday);
      this.logger.log(`Successfully updated holiday ID: ${id}`);

      return MasterHolidayMapper.toResponseDto(updatedHoliday);
    } catch (error) {
      this.logger.error(`Failed to update holiday ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to update holiday: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async remove(id: number): Promise<void> {
    this.logger.log(`Starting removal of holiday ID: ${id}`);
    try {
      const result = await this.holidayRepository.delete(id);

      if (result.affected === 0) {
        this.logger.warn(`Removal failed: Holiday ID ${id} not found`);
        throw new NotFoundException(`Holiday with ID ${id} not found`);
      }
      this.logger.log(`Successfully removed holiday ID: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to remove holiday ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to remove holiday: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
