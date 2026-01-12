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
import { EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { FileService } from '../../common/core/utils/fileType.utils';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { Readable } from 'stream';

@ApiTags('Master Holidays')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
    this.logger.log('POST /master-holidays');
    return await this.masterHolidayService.create(createHolidayDto);
  }

  @Post('holidays')
  @ApiOperation({ summary: 'Create multiple holidays' })
  @ApiBody({ type: [CreateHolidayDto] })
  @ApiResponse({ status: 201, description: 'Holidays have been successfully created.' })
  @HttpCode(HttpStatus.CREATED)
  async createBulk(@Body() dtos: CreateHolidayDto[]) {
    return await this.masterHolidayService.createBulk(dtos);
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
    const loginId = req.user?.userId || 'system';
    this.logger.log(`User ${loginId} fetching files for holiday ${entityId}`);
    const files = await this.masterHolidayService.getAllFiles(entityType, entityId, refId, referenceType);
    return files;
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
    const loginId = req.user?.userId || 'system';
    this.logger.log(`User ${loginId} downloading file for holiday ${entityId}`);

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
    const loginId = req.user?.userId || 'system';
    this.logger.log(`User ${loginId} deleting file for holiday ${entityId}`);
    const result = await this.masterHolidayService.deleteDocument(entityType, entityId, refId, key);
    return result;
  }

  @Get('date-range/from/:fromDate/to/:toDate')
  @ApiOperation({ summary: 'Get holidays between two dates' })
  @ApiResponse({ status: 200, description: 'Return holidays within the specified date range.' })
  async getHolidaysByDateRange(
    @Param('fromDate') fromDate: string,
    @Param('toDate') toDate: string,
  ) {
    this.logger.log(`GET /master-holidays/date-range/from/${fromDate}/to/${toDate}`);
    return await this.masterHolidayService.findByDateRange(fromDate, toDate);
  }

  @Post('date-range')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get holidays by date range (POST)' })
  @ApiBody({ type: HolidayDateRangeDto })
  @ApiResponse({ status: 200, description: 'Return holidays within the specified date range.' })
  async findByDateRange(@Body() dateRangeDto: HolidayDateRangeDto) {
    this.logger.log(`POST /master-holidays/date-range from ${dateRangeDto.fromDate} to ${dateRangeDto.toDate}`);
    return await this.masterHolidayService.findByDateRange(dateRangeDto.fromDate, dateRangeDto.toDate);
  }

  @Get()
  @ApiOperation({ summary: 'Get all holidays' })
  @ApiResponse({ status: 200, description: 'Return all holidays.' })
  async findAll() {
    this.logger.log('GET /master-holidays');
    return await this.masterHolidayService.findAll();
  }

  @Get('month/:month')
  @ApiOperation({ summary: 'Get holidays for a specific month' })
  @ApiResponse({ status: 200, description: 'Returns holidays for the specified month' })
  async findByMonth(@Param('month', ParseIntPipe) month: number) {
    return await this.masterHolidayService.findByMonth(month);
  }

  @Get('month/:month/year/:year')
  @ApiOperation({ summary: 'Get holidays for a specific month and year' })
  @ApiResponse({ status: 200, description: 'Returns holidays for the specified month and year' })
  async findByMonthAndYear(
    @Param('month', ParseIntPipe) month: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return await this.masterHolidayService.findByMonthAndYear(month, year);
  }

  @Get('weekends/:year')
  @ApiOperation({ summary: 'Get all 2nd and 4th Saturdays for a specific year' })
  @ApiResponse({ status: 200, description: 'Returns all 2nd and 4th Saturdays for the year' })
  async getYearWeekends(@Param('year', ParseIntPipe) year: number) {
    return await this.masterHolidayService.getYearWeekends(year);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a holiday by id' })
  @ApiResponse({ status: 200, description: 'Return a single holiday.' })
  async findOne(@Param('id') id: string) {
    this.logger.log(`GET /master-holidays/${id}`);
    return await this.masterHolidayService.findOne(+id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a holiday' })
  @ApiBody({ type: UpdateHolidayDto })
  @ApiResponse({ status: 200, description: 'The holiday has been successfully updated.' })
  async update(@Param('id') id: string, @Body() updateHolidayDto: UpdateHolidayDto) {
    this.logger.log(`PUT /master-holidays/${id}`);
    return await this.masterHolidayService.update(+id, updateHolidayDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a holiday (Patch)' })
  @ApiBody({ type: UpdateHolidayDto })
  @ApiResponse({ status: 200, description: 'The holiday has been successfully updated.' })
  async patch(@Param('id') id: string, @Body() updateHolidayDto: UpdateHolidayDto) {
    this.logger.log(`PATCH /master-holidays/${id}`);
    return await this.masterHolidayService.update(+id, updateHolidayDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a holiday' })
  @ApiResponse({ status: 200, description: 'The holiday has been successfully deleted.' })
  async remove(@Param('id') id: string) {
    this.logger.log(`DELETE /master-holidays/${id}`);
    return await this.masterHolidayService.remove(+id);
  }
}
