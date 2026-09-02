import { Controller, Get, Post, Delete, Body, Param, Query, Req, Res, UseGuards, HttpStatus, HttpCode, Logger, UseInterceptors, UploadedFiles, HttpException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { QuarterlyReviewService } from '../services/quarterly-review.service';
import { CreateQuarterlyReviewDto } from '../dto/create-quarterly-review.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { DocumentUploaderService } from '../../../common/document-uploader/services/document-uploader.service';
import { FileService } from '../../../common/core/utils/fileType.utils';
import { EntityType, ReferenceType } from '../../../common/document-uploader/models/documentmetainfo.model';
import { Readable } from 'stream';
import { NO_CACHE_HEADERS } from '../../../common/utils/no-cache-headers';

@ApiTags('Quarterly Review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quarterly-review')
export class QuarterlyReviewController {
  private readonly logger = new Logger(QuarterlyReviewController.name);

  constructor(
    private readonly quarterlyReviewService: QuarterlyReviewService,
    private readonly documentUploaderService: DocumentUploaderService,
    private readonly fileService: FileService,
  ) {}

  @Get('current-quarter')
  @ApiOperation({ summary: 'Get current quarter name' })
  getCurrentQuarter() {
    return {
      success: true,
      data: {
        quarter: this.quarterlyReviewService.getCurrentQuarter(),
      },
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all quarterly reviews for logged-in employee' })
  async findAll(@Req() req: any, @Query('financialYear') financialYear?: string) {
    const employeeId = req.user.loginId;
    this.logger.log(`Fetching all reviews for employee ${employeeId}${financialYear ? ` | FY: ${financialYear}` : ''}`);
    const reviews = await this.quarterlyReviewService.findAllForEmployee(employeeId, financialYear);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      data: reviews,
    };
  }

  @Get('quarter/:quarter')
  @ApiOperation({ summary: 'Get quarterly review by quarter' })
  async findOne(@Req() req: any, @Param('quarter') quarter: string) {
    const employeeId = req.user.loginId;
    this.logger.log(`Fetching review for employee ${employeeId}, quarter ${quarter}`);
    const review = await this.quarterlyReviewService.findOneByQuarter(employeeId, quarter);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      data: review,
    };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update quarterly review (Save Draft or Submit)' })
  async saveOrSubmit(@Req() req: any, @Body() dto: CreateQuarterlyReviewDto) {
    const employeeId = req.user.loginId;
    const username = req.user.aliasLoginName || employeeId;
    this.logger.log(`Saving or submitting quarterly review for employee ${employeeId}`);
    const review = await this.quarterlyReviewService.saveOrSubmit(employeeId, dto, username);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      data: review,
    };
  }

  @Post('upload-file/entityId/:entityId/refId/:refId')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 1 }]))
  async uploadDocument(
    @UploadedFiles() docs: { file?: Express.Multer.File[] },
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('refType') refType: ReferenceType,
    @Query('entityType') entityType: EntityType,
  ) {
    try {
      this.logger.log(`Uploading document for quarterly review entityId: ${entityId}, refId: ${refId}`);
      if (entityId === 'NaN' || isNaN(Number(entityId))) {
        throw new HttpException('Invalid entityId: must be a numeric string.', HttpStatus.BAD_REQUEST);
      }
      if (refId === 'NaN' || isNaN(Number(refId))) {
        throw new HttpException('Invalid refId: must be a numeric string.', HttpStatus.BAD_REQUEST);
      }

      const documents = docs.file || [];

      if (!refType) {
        throw new HttpException('Reference type is required', HttpStatus.BAD_REQUEST);
      }

      if (documents.length === 0) {
        throw new HttpException('No files uploaded', HttpStatus.BAD_REQUEST);
      }

      for (const file of documents) {
        await this.fileService.validateFileType(file);
      }

      return await this.quarterlyReviewService.uploadDocument(documents, refType, +refId, entityType, +entityId);
    } catch (error) {
      this.logger.error(`Error uploading document: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('entityId/:entityId/refId/:refId/get-files')
  @HttpCode(HttpStatus.OK)
  async getFiles(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('refType') referenceType: ReferenceType,
    @Query('entityType') entityType: EntityType,
  ) {
    try {
      this.logger.log(`Fetching files for quarterly review entityId: ${entityId}, refId: ${refId}`);
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
      }
      return await this.quarterlyReviewService.getAllFiles(entityType, +entityId, +refId, referenceType);
    } catch (error) {
      this.logger.error(`Error fetching files: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('entityId/:entityId/refId/:refId/download-file')
  @HttpCode(HttpStatus.OK)
  async downloadFile(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('key') key: string,
    @Res() res: any,
  ) {
    try {
      this.logger.log(`Downloading quarterly review file with key: ${key}`);
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
      }

      const metaData = await this.documentUploaderService.getMetaData(key);
      const dataStream = await this.documentUploaderService.downloadFile(key);

      res.set({
        ...NO_CACHE_HEADERS,
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
      this.logger.error(`Error downloading file: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('entityId/:entityId/refId/:refId/view')
  @HttpCode(HttpStatus.OK)
  async viewFile(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('key') key: string,
    @Res() res: any,
  ) {
    try {
      this.logger.log(`Viewing quarterly review file with key: ${key}`);
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
      }

      const metaData = await this.documentUploaderService.getMetaData(key);
      const dataStream = await this.documentUploaderService.downloadFile(key);

      res.set({
        ...NO_CACHE_HEADERS,
        'Content-Type': metaData.mimetype,
        'Content-Disposition': `inline; filename="${metaData.filename}"`,
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
      this.logger.error(`Error viewing file: ${error.message}`, error.stack);
      throw error;
    }
  }
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete or withdraw a quarterly review by ID or Quarter' })
  async deleteOrWithdraw(@Req() req: any, @Param('id') id: string) {
    const employeeId = req.user.loginId;
    this.logger.log(`Employee ${employeeId} requesting delete/withdraw for review id/quarter=${id}`);
    const result = await this.quarterlyReviewService.deleteOrWithdraw(employeeId, id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result.data || null,
    };
  }


  @Delete('entityId/:entityId/refId/:refId/delete')
  @HttpCode(HttpStatus.OK)
  async deleteFile(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('key') key: string,
    @Query('entityType') entityType: EntityType,
  ) {
    try {
      this.logger.log(`Deleting quarterly review file with key: ${key}`);
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
      }
      return await this.quarterlyReviewService.deleteDocument(entityType, +entityId, +refId, key);
    } catch (error) {
      this.logger.error(`Error deleting file: ${error.message}`, error.stack);
      throw error;
    }
  }


  @Get(':id/download-pdf')
  @ApiOperation({ summary: 'Download completed quarterly review PDF report' })
  async downloadPdf(
    @Req() req: any,
    @Param('id') id: string,
    @Res() res: any,
  ) {
    const employeeId = req.user.loginId;
    this.logger.log(`Employee ${employeeId} downloading PDF for review id/quarter='${id}'`);
    const { buffer, filename } = await this.quarterlyReviewService.generateQuarterlyReviewPdf(employeeId, id);
    res.set({
      ...NO_CACHE_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

}