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
  ) {}

  async create(createHolidayDto: CreateHolidayDto): Promise<any> {
    const METHOD = 'create';
    this.logger.log(`[${METHOD}] Started creating holiday: ${createHolidayDto.name}`);
    
    try {
      // STEP 1: Mapping DTO to Entity
      this.logger.debug(`[${METHOD}][STEP 1] Mapping DTO to entity...`);
      const holiday = MasterHolidayMapper.toEntity(createHolidayDto);
      
      // STEP 2: Saving to Database
      this.logger.debug(`[${METHOD}][STEP 2] Saving to database...`);
      const savedHoliday = await this.holidayRepository.save(holiday);
      
      // STEP 3: Mapping Entity to Response
      this.logger.debug(`[${METHOD}][STEP 3] Mapping to response DTO...`);
      const response = MasterHolidayMapper.toResponseDto(savedHoliday);
      
      this.logger.log(`[${METHOD}] Successfully created holiday ID: ${savedHoliday.id}`);
      return response;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
        this.logger.warn(`[${METHOD}] Duplicate entry detected for date: ${createHolidayDto.date}`);
        throw new ConflictException('Holiday already exists for this date');
      }
      this.logger.error(`[${METHOD}] Failed to create holiday. Error: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error creating holiday');
    }
  }

  async createBulk(createHolidayDtos: CreateHolidayDto[]): Promise<any[]> {
    const METHOD = 'createBulk';
    this.logger.log(`[${METHOD}] Started creating ${createHolidayDtos.length} holidays`);
    
    try {
      // STEP 1: Mapping DTOs to Entities
      this.logger.debug(`[${METHOD}][STEP 1] Mapping ${createHolidayDtos.length} DTOs to entities...`);
      const holidays = createHolidayDtos.map(dto => MasterHolidayMapper.toEntity(dto));
      
      // STEP 2: Bulk Saving to Database
      this.logger.debug(`[${METHOD}][STEP 2] Saving ${holidays.length} holidays to database...`);
      const savedHolidays = await this.holidayRepository.save(holidays);
      
      // STEP 3: Mapping to Response DTOs
      this.logger.debug(`[${METHOD}][STEP 3] Mapping to response DTOs...`);
      const response = savedHolidays.map(holiday => MasterHolidayMapper.toResponseDto(holiday));
      
      this.logger.log(`[${METHOD}] Successfully created ${savedHolidays.length} holidays`);
      return response;
    } catch (error) {
       this.logger.error(`[${METHOD}] Failed to create bulk holidays. Error: ${error.message}`, error.stack);
       throw new InternalServerErrorException('Error creating bulk holidays');
    }
  }

  async uploadDocument(
    documents: Express.Multer.File[],
    refType: ReferenceType,
    refId: number,
    entityType: EntityType,
    entityId: number,
  ) {
    try {
      this.logger.log(`Uploading ${documents.length} document(s) for holiday ${entityId}`);
      
      const uploadPromises = documents.map(async (doc) => {
        const details = new DocumentMetaInfo();
        details.refId = refId;
        details.refType = refType;
        details.entityId = entityId;
        details.entityType = entityType;

        return await this.documentUploaderService.uploadImage(doc, details);
      });

      const results = await Promise.all(uploadPromises);
      this.logger.log(`Successfully uploaded ${results.length} document(s)`);
      
      return {
        success: true,
        message: 'Documents uploaded successfully',
        data: results,
      };
    } catch (error) {
      this.logger.error(`Error uploading documents: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error uploading documents');
    }
  }

  async getAllFiles(entityType: EntityType, entityId: number, refId: number, referenceType: ReferenceType) {
    this.logger.log(`Getting all files for entity ${entityType} with ID ${entityId}`);
    return await this.documentUploaderService.getAllDocs(entityType, entityId, referenceType, refId);
  }

  async deleteDocument(entityType: EntityType, entityId: number, refId: number, key: string) {
    try {
      this.logger.log(`Deleting document with key ${key} for entity ${entityId}`);
      await this.validateEntity(entityType, entityId, refId);
      await this.documentUploaderService.deleteDoc(key);
      
      return {
        success: true,
        message: 'Document deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Error deleting document: ${error.message}`, error.stack);
      throw error;
    }
  }

  async validateEntity(entityType: EntityType, entityId: number, refId: number) {
    if (entityType === EntityType.MASTER_HOLIDAY) {
      const holiday = await this.holidayRepository.findOne({ where: { id: entityId } });
      if (!holiday) {
        throw new HttpException(`Holiday with ID ${entityId} not found`, HttpStatus.NOT_FOUND);
      }
    }
  }

  async findAll(): Promise<any[]> {
    try {
      this.logger.log('Fetching all holidays');
      const holidays = await this.holidayRepository.find({
        order: { date: 'ASC' }
      });
      return holidays.map(holiday => MasterHolidayMapper.toResponseDto(holiday));
    } catch (error) {
      this.logger.error(`Error fetching holidays: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error fetching holidays');
    }
  }

  async findOne(id: number): Promise<any> {
    try {
      this.logger.log(`Fetching holiday with id: ${id}`);
      const holiday = await this.holidayRepository.findOne({ where: { id } });
      
      if (!holiday) {
        throw new NotFoundException(`Holiday with ID ${id} not found`);
      }
      
      return MasterHolidayMapper.toResponseDto(holiday);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error fetching holiday ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error fetching holiday');
    }
  }

  async findByDateRange(fromDate: string, toDate: string): Promise<any[]> {
    try {
      this.logger.log(`Fetching holidays from ${fromDate} to ${toDate}`);
      const holidays = await this.holidayRepository
        .createQueryBuilder('holiday')
        .where('holiday.date >= :fromDate', { fromDate })
        .andWhere('holiday.date <= :toDate', { toDate })
        .orderBy('holiday.date', 'ASC')
        .getMany();

      return holidays.map(holiday => MasterHolidayMapper.toResponseDto(holiday));
    } catch (error) {
      this.logger.error(`Error fetching holidays by date range: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error fetching holidays by date range');
    }
  }

  async findByMonth(month: number): Promise<any[]> {
    try {
      this.logger.log(`Fetching holidays for month: ${month}`);
      const holidays = await this.holidayRepository
        .createQueryBuilder('holiday')
        .where('MONTH(holiday.date) = :month', { month })
        .orderBy('holiday.date', 'ASC')
        .getMany();
      return holidays.map(holiday => MasterHolidayMapper.toResponseDto(holiday));
    } catch (error) {
      this.logger.error(`Error fetching holidays by month: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error fetching holidays by month');
    }
  }

  async findByMonthAndYear(month: number, year: number): Promise<any[]> {
    try {
      this.logger.log(`Fetching holidays for ${month}/${year}`);
       const holidays = await this.holidayRepository
        .createQueryBuilder('holiday')
        .where('MONTH(holiday.date) = :month', { month })
        .andWhere('YEAR(holiday.date) = :year', { year })
        .orderBy('holiday.date', 'ASC')
        .getMany();
      return holidays.map(holiday => MasterHolidayMapper.toResponseDto(holiday));
    } catch (error) {
       this.logger.error(`Error fetching holidays by month and year: ${error.message}`, error.stack);
       throw new InternalServerErrorException('Error fetching holidays by month and year');
    }
  }

  async getYearWeekends(year: number): Promise<any[]> {
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
      return weekends;
  }

  isWeekend(date: Date): boolean {
      const day = date.getDay();
      // 0 is Sunday, 6 is Saturday
      return day === 0 || day === 6;
  }

  async findByDate(date: string): Promise<any> {
    try {
      this.logger.log(`Fetching holiday for date: ${date}`);
      const holiday = await this.holidayRepository
        .createQueryBuilder('holiday')
        .where('holiday.date = :date', { date })
        .getOne();
      
      if (!holiday) {
        return null; 
      }

      return MasterHolidayMapper.toResponseDto(holiday);
    } catch (error) {
      this.logger.error(`Error fetching holiday by date: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error fetching holiday by date');
    }
  }

  async update(id: number, updateHolidayDto: UpdateHolidayDto): Promise<any> {
    const METHOD = 'update';
    this.logger.log(`[${METHOD}] Started updating holiday ID: ${id}`);
    
    try {
      // STEP 1: Fetching Existing Holiday
      this.logger.debug(`[${METHOD}][STEP 1] Fetching holiday from database...`);
      const holiday = await this.holidayRepository.findOne({ where: { id } });
      
      if (!holiday) {
        this.logger.warn(`[${METHOD}][STEP 1] Holiday with ID ${id} not found`);
        throw new NotFoundException(`Holiday with ID ${id} not found`);
      }

      // STEP 2: Updating Fields
      this.logger.debug(`[${METHOD}][STEP 2] Updating holiday fields...`);
      if (updateHolidayDto.date) holiday.date = new Date(updateHolidayDto.date);
      if (updateHolidayDto.name) holiday.name = updateHolidayDto.name;

      // STEP 3: Saving Changes
      this.logger.debug(`[${METHOD}][STEP 3] Saving updated holiday to database...`);
      const updatedHoliday = await this.holidayRepository.save(holiday);
      
      // STEP 4: Mapping to Response
      this.logger.debug(`[${METHOD}][STEP 4] Mapping to response DTO...`);
      const response = MasterHolidayMapper.toResponseDto(updatedHoliday);
      
      this.logger.log(`[${METHOD}] Successfully updated holiday ID: ${id}`);
      return response;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`[${METHOD}] Failed to update holiday ${id}. Error: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error updating holiday');
    }
  }

  async remove(id: number): Promise<void> {
    try {
      this.logger.log(`Deleting holiday with id: ${id}`);
      const result = await this.holidayRepository.delete(id);
      
      if (result.affected === 0) {
        throw new NotFoundException(`Holiday with ID ${id} not found`);
      }
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error deleting holiday ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error deleting holiday');
    }
  }
}
