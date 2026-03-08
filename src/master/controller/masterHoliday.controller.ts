import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Patch,
  Param,
  Delete,
  HttpStatus,
  HttpCode,
  Logger,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  Req,
  Res,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { MasterHolidayService } from '../service/master-holiday.service';
import { CreateHolidayDto } from '../dto/create-holiday.dto';
import { UpdateHolidayDto } from '../dto/update-holiday.dto';
import { HolidayDateRangeDto } from '../dto/holiday-date-range.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ReceptionistReadOnlyGuard } from '../../auth/guards/receptionist-readonly.guard';
import { EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { FileService } from '../../common/core/utils/fileType.utils';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { Readable } from 'stream';

@ApiTags('Master Holidays')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ReceptionistReadOnlyGuard)
@Controller('master-holidays')
export class MasterHolidayController {
  private readonly logger = new Logger(MasterHolidayController.name);

  constructor(
    private readonly masterHolidayService: MasterHolidayService,
    private readonly documentUploaderService: DocumentUploaderService,
    private readonly fileService: FileService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new holiday' })
  @ApiBody({ type: CreateHolidayDto })
  @ApiResponse({ status: 201, description: 'The holiday has been successfully created.' })
  async create(@Body() createHolidayDto: CreateHolidayDto) {
    try {
      this.logger.log(`Creating holiday: ${createHolidayDto.name}`);
      return await this.masterHolidayService.create(createHolidayDto);
    } catch (error) {
      this.logger.error(`Error creating holiday: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('holidays')
  @ApiOperation({ summary: 'Create multiple holidays' })
  @ApiBody({ type: [CreateHolidayDto] })
  @ApiResponse({ status: 201, description: 'Holidays have been successfully created.' })
  @HttpCode(HttpStatus.CREATED)
  async createBulk(@Body() dtos: CreateHolidayDto[]) {
    try {
      this.logger.log(`Creating ${dtos.length} holidays in bulk`);
      return await this.masterHolidayService.createBulk(dtos);
    } catch (error) {
      this.logger.error(`Error bulk creating holidays: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('upload-file/entityId/:entityId/refId/:refId')
  @ApiOperation({ summary: 'Upload holiday documents' })
  @ApiParam({ name: 'entityId', type: Number, description: 'Entity ID (Holiday ID)' })
  @ApiParam({ name: 'refId', type: Number, description: 'Reference ID' })
  @ApiQuery({ name: 'refType', enum: ReferenceType, required: true })
  @ApiQuery({ name: 'entityType', enum: EntityType, required: true })
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 1 }]))
  async uploadDocument(
    @UploadedFiles() docs: { file?: Express.Multer.File[] },
    @Param('entityId', ParseIntPipe) entityId: number,
    @Param('refId', ParseIntPipe) refId: number,
    @Query('refType') refType: ReferenceType,
    @Query('entityType') entityType: EntityType,
    @Req() req: any,
  ) {
    try {
      const userContext = req.user;
      const loginId = userContext?.userId || 'system';
      this.logger.log(`User ${loginId} uploading documents for holiday ${entityId}`);

      const documents = docs.file || [];

      if (!refType) {
        throw new HttpException('Reference type is required', HttpStatus.BAD_REQUEST);
      }

      if (documents.length === 0) {
        throw new HttpException('No files uploaded', HttpStatus.BAD_REQUEST);
      }

      if (refType === ReferenceType.MASTER_HOLIDAY_DOCUMENT && documents.length > 1) {
        throw new HttpException('Only one document allowed for holiday', HttpStatus.BAD_REQUEST);
      }

      for (const file of documents) {
        await this.fileService.validateFileType(file);
      }

      const result = await this.masterHolidayService.uploadDocument(documents, refType, refId, entityType, entityId);
      this.logger.log(`User ${loginId} successfully uploaded documents for holiday ${entityId}`);
      return result;
    } catch (error) {
      this.logger.error(`Error uploading documents for holiday ${entityId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('entityId/:entityId/refId/:refId/get-files')
  @ApiOperation({ summary: 'Get all holiday files' })
  @ApiParam({ name: 'entityId', type: Number, description: 'Entity ID' })
  @ApiParam({ name: 'refId', type: Number, description: 'Reference ID' })
  @ApiQuery({ name: 'refType', enum: ReferenceType, required: false })
  @ApiQuery({ name: 'entityType', enum: EntityType, required: true })
  @HttpCode(HttpStatus.OK)
  async getFiles(
    @Param('entityId', ParseIntPipe) entityId: number,
    @Param('refId', ParseIntPipe) refId: number,
    @Query('refType') referenceType: ReferenceType,
    @Query('entityType') entityType: EntityType,
    @Req() req: any,
  ) {
    try {
      const loginId = req.user?.userId || 'system';
      this.logger.log(`User ${loginId} fetching files for holiday ${entityId}`);
      return await this.masterHolidayService.getAllFiles(entityType, entityId, refId, referenceType);
    } catch (error) {
      this.logger.error(`Error fetching files for holiday ${entityId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('entityId/:entityId/refId/:refId/download-file')
  @ApiOperation({ summary: 'Download holiday file' })
  @ApiParam({ name: 'entityId', type: Number, description: 'Entity ID' })
  @ApiParam({ name: 'refId', type: Number, description: 'Reference ID' })
  @ApiQuery({ name: 'key', required: true })
  @ApiQuery({ name: 'entityType', enum: EntityType, required: true })
  @HttpCode(HttpStatus.OK)
  async downloadFile(
    @Param('entityId', ParseIntPipe) entityId: number,
    @Param('refId', ParseIntPipe) refId: number,
    @Query('key') key: string,
    @Query('entityType') entityType: EntityType,
    @Res() res: any,
    @Req() req: any,
  ) {
    try {
      const loginId = req.user?.userId || 'system';
      this.logger.log(`User ${loginId} downloading file for holiday ${entityId} - Key: ${key}`);

      await this.masterHolidayService.validateEntity(entityType, entityId, refId);

      const metaData = await this.documentUploaderService.getMetaData(key);
      const dataStream = await this.documentUploaderService.downloadFile(key);

      res.set({
        'Content-Type': metaData.mimetype,
        'Content-Disposition': `attachment; filename="${metaData.filename}"`,
        'Content-Length': dataStream.ContentLength || undefined,
      });

      if (dataStream.Body instanceof Readable) {
        dataStream.Body.pipe(res);
      } else if (dataStream.Body) {
        const buffer = await dataStream.Body.transformToByteArray();
        res.send(Buffer.from(buffer));
      } else {
        throw new HttpException('File content not found', HttpStatus.NOT_FOUND);
      }
    } catch (error) {
      this.logger.error(`Error downloading file for holiday ${entityId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete('entityId/:entityId/refId/:refId/delete-file')
  @ApiOperation({ summary: 'Delete holiday file' })
  @ApiParam({ name: 'entityId', type: Number, description: 'Entity ID' })
  @ApiParam({ name: 'refId', type: Number, description: 'Reference ID' })
  @ApiQuery({ name: 'key', required: true })
  @ApiQuery({ name: 'entityType', enum: EntityType, required: true })
  @HttpCode(HttpStatus.OK)
  async deleteFile(
    @Param('entityId', ParseIntPipe) entityId: number,
    @Param('refId', ParseIntPipe) refId: number,
    @Query('key') key: string,
    @Query('entityType') entityType: EntityType,
    @Req() req: any,
  ) {
    try {
      const loginId = req.user?.userId || 'system';
      this.logger.log(`User ${loginId} deleting file for holiday ${entityId} - Key: ${key}`);
      return await this.masterHolidayService.deleteDocument(entityType, entityId, refId, key);
    } catch (error) {
      this.logger.error(`Error deleting file for holiday ${entityId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('date-range/from/:fromDate/to/:toDate')
  @ApiOperation({ summary: 'Get holidays between two dates' })
  @ApiResponse({ status: 200, description: 'Return holidays within the specified date range.' })
  async getHolidaysByDateRange(
    @Param('fromDate') fromDate: string,
    @Param('toDate') toDate: string,
  ) {
    try {
      this.logger.log(`Fetching holidays from ${fromDate} to ${toDate}`);
      return await this.masterHolidayService.findByDateRange(fromDate, toDate);
    } catch (error) {
      this.logger.error(`Error fetching holidays by date range: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('date-range')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get holidays by date range (POST)' })
  @ApiBody({ type: HolidayDateRangeDto })
  @ApiResponse({ status: 200, description: 'Return holidays within the specified date range.' })
  async findByDateRange(@Body() dateRangeDto: HolidayDateRangeDto) {
    try {
      this.logger.log(`Fetching holidays (POST) from ${dateRangeDto.fromDate} to ${dateRangeDto.toDate}`);
      return await this.masterHolidayService.findByDateRange(dateRangeDto.fromDate, dateRangeDto.toDate);
    } catch (error) {
      this.logger.error(`Error fetching holidays by date range (POST): ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all holidays' })
  @ApiResponse({ status: 200, description: 'Return all holidays.' })
  async findAll() {
    try {
      this.logger.log('Fetching all holidays');
      return await this.masterHolidayService.findAll();
    } catch (error) {
      this.logger.error(`Error fetching all holidays: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('month/:month')
  @ApiOperation({ summary: 'Get holidays for a specific month' })
  @ApiResponse({ status: 200, description: 'Returns holidays for the specified month' })
  async findByMonth(@Param('month', ParseIntPipe) month: number) {
    try {
      this.logger.log(`Fetching holidays for month: ${month}`);
      return await this.masterHolidayService.findByMonth(month);
    } catch (error) {
      this.logger.error(`Error fetching holidays for month ${month}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('month/:month/year/:year')
  @ApiOperation({ summary: 'Get holidays for a specific month and year' })
  @ApiResponse({ status: 200, description: 'Returns holidays for the specified month and year' })
  async findByMonthAndYear(
    @Param('month', ParseIntPipe) month: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    try {
      this.logger.log(`Fetching holidays for ${month}/${year}`);
      return await this.masterHolidayService.findByMonthAndYear(month, year);
    } catch (error) {
      this.logger.error(`Error fetching holidays for ${month}/${year}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('weekends/:year')
  @ApiOperation({ summary: 'Get all 2nd and 4th Saturdays for a specific year' })
  @ApiResponse({ status: 200, description: 'Returns all 2nd and 4th Saturdays for the year' })
  async getYearWeekends(@Param('year', ParseIntPipe) year: number) {
    try {
      this.logger.log(`Fetching weekends for year: ${year}`);
      return await this.masterHolidayService.getYearWeekends(year);
    } catch (error) {
      this.logger.error(`Error fetching weekends for year ${year}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a holiday by id' })
  @ApiResponse({ status: 200, description: 'Return a single holiday.' })
  async findOne(@Param('id') id: string) {
    try {
      this.logger.log(`Fetching holiday ID: ${id}`);
      return await this.masterHolidayService.findOne(+id);
    } catch (error) {
      this.logger.error(`Error fetching holiday ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a holiday' })
  @ApiBody({ type: UpdateHolidayDto })
  @ApiResponse({ status: 200, description: 'The holiday has been successfully updated.' })
  async update(@Param('id') id: string, @Body() updateHolidayDto: UpdateHolidayDto) {
    try {
      this.logger.log(`Updating holiday ID: ${id}`);
      return await this.masterHolidayService.update(+id, updateHolidayDto);
    } catch (error) {
      this.logger.error(`Error updating holiday ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a holiday (Patch)' })
  @ApiBody({ type: UpdateHolidayDto })
  @ApiResponse({ status: 200, description: 'The holiday has been successfully updated.' })
  async patch(@Param('id') id: string, @Body() updateHolidayDto: UpdateHolidayDto) {
    try {
      this.logger.log(`Patching holiday ID: ${id}`);
      return await this.masterHolidayService.update(+id, updateHolidayDto);
    } catch (error) {
      this.logger.error(`Error patching holiday ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a holiday' })
  @ApiResponse({ status: 200, description: 'The holiday has been successfully deleted.' })
  async remove(@Param('id') id: string) {
    try {
      this.logger.log(`Deleting holiday ID: ${id}`);
      return await this.masterHolidayService.remove(+id);
    } catch (error) {
      this.logger.error(`Error deleting holiday ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
