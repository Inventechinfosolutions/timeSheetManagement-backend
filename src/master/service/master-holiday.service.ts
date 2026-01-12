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
    try {
      this.logger.log(`Creating new holiday: ${createHolidayDto.name}`);
      
      const holiday = MasterHolidayMapper.toEntity(createHolidayDto);
      const savedHoliday = await this.holidayRepository.save(holiday);
      
      return {
        success: true,
        message: 'Holiday created successfully',
        data: MasterHolidayMapper.toResponseDto(savedHoliday),
      };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
        throw new ConflictException('Holiday already exists for this date');
      }
      this.logger.error(`Error creating holiday: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error creating holiday');
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

  async findAll(): Promise<any> {
    try {
      this.logger.log('Fetching all holidays');
      const holidays = await this.holidayRepository.find({
        order: { date: 'ASC' }
      });
      return {
        success: true,
        data: holidays.map(holiday => MasterHolidayMapper.toResponseDto(holiday)),
      };
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
      
      return {
        success: true,
        data: MasterHolidayMapper.toResponseDto(holiday),
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error fetching holiday ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error fetching holiday');
    }
  }

  async findByDateRange(fromDate: string, toDate: string): Promise<any> {
    try {
      this.logger.log(`Fetching holidays from ${fromDate} to ${toDate}`);
      const holidays = await this.holidayRepository
        .createQueryBuilder('holiday')
        .where('holiday.date >= :fromDate', { fromDate })
        .andWhere('holiday.date <= :toDate', { toDate })
        .orderBy('holiday.date', 'ASC')
        .getMany();

      return {
        success: true,
        data: holidays.map(holiday => MasterHolidayMapper.toResponseDto(holiday)),
      };
    } catch (error) {
      this.logger.error(`Error fetching holidays by date range: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error fetching holidays by date range');
    }
  }

  async update(id: number, updateHolidayDto: UpdateHolidayDto): Promise<any> {
    try {
      this.logger.log(`Updating holiday with id: ${id}`);
      const holiday = await this.holidayRepository.findOne({ where: { id } });
      
      if (!holiday) {
        throw new NotFoundException(`Holiday with ID ${id} not found`);
      }

      if (updateHolidayDto.date) holiday.date = new Date(updateHolidayDto.date);
      if (updateHolidayDto.name) holiday.name = updateHolidayDto.name;
      if (updateHolidayDto.type !== undefined) holiday.type = updateHolidayDto.type;
      if (updateHolidayDto.isWeekendHoliday !== undefined) holiday.isWeekendHoliday = updateHolidayDto.isWeekendHoliday;

      const updatedHoliday = await this.holidayRepository.save(holiday);
      
      return {
        success: true,
        message: 'Holiday updated successfully',
        data: MasterHolidayMapper.toResponseDto(updatedHoliday),
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error updating holiday ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error updating holiday');
    }
  }

  async remove(id: number): Promise<any> {
    try {
      this.logger.log(`Deleting holiday with id: ${id}`);
      const result = await this.holidayRepository.delete(id);
      
      if (result.affected === 0) {
        throw new NotFoundException(`Holiday with ID ${id} not found`);
      }
      
      return {
        success: true,
        message: 'Holiday deleted successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error deleting holiday ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error deleting holiday');
    }
  }
}
