import { Controller, Get, Post, Body, Query, Delete, Param, Patch, UseInterceptors, UploadedFiles, ParseIntPipe, Req, Res, HttpException, HttpStatus, HttpCode } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { LeaveRequestsService } from '../services/leave-requests.service';
import { LeaveRequestDto } from '../dto/leave-request.dto';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { FileService } from '../../common/core/utils/fileType.utils';
import { EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { Readable } from 'stream';

@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(
    private readonly leaveRequestsService: LeaveRequestsService,
    private readonly documentUploaderService: DocumentUploaderService,
    private readonly fileService: FileService,
  ) {}

  @Post(':employeeId/leave-requests')
  create(@Param('employeeId') employeeId: string, @Body() body: LeaveRequestDto) {
    body.employeeId = employeeId;
    return this.leaveRequestsService.create(body);
  }

  @Post()
  createRoot(@Body() body: LeaveRequestDto) {
    return this.leaveRequestsService.create(body);
  }

  @Get()
  findAll(
    @Query('employeeId') employeeId?: string,
    @Query('department') department?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    if (employeeId) {
      return this.leaveRequestsService.findByEmployeeId(employeeId);
    }
    return this.leaveRequestsService.findAll(department, status, search);
  }

  @Get('employee/:employeeId')
  findByEmployeeId(@Param('employeeId') employeeId: string) {
    return this.leaveRequestsService.findByEmployeeId(employeeId);
  }

  @Get('notifications/unread')
  findUnread() {
    return this.leaveRequestsService.findUnread();
  }

  @Get('employee/:employeeId/updates')
  findEmployeeUpdates(@Param('employeeId') employeeId: string) {
    return this.leaveRequestsService.findEmployeeUpdates(employeeId);
  }

  @Patch('notifications/:id/read')
  markAsRead(@Param('id') id: string) {
    return this.leaveRequestsService.markAsRead(+id);
  }

  @Patch('employee/notifications/:id/read')
  markEmployeeRead(@Param('id') id: string) {
    return this.leaveRequestsService.markEmployeeUpdateRead(+id);
  }

  @Post('notifications/mark-all-read')
  markAllAsRead() {
    return this.leaveRequestsService.markAllAsRead();
  }

  @Delete(':id/RequestDeleted')
  remove(@Param('id') id: string) {
    return this.leaveRequestsService.remove(+id);
  }
  
  @Post(':id/update-status')
  updateStatus(@Param('id') id: string, @Body('status') status: 'Approved' | 'Rejected' | 'Cancelled') {
    return this.leaveRequestsService.updateStatus(+id, status);
  }

  @Get('stats/:employeeId')
  getStats(@Param('employeeId') employeeId: string) {
    return this.leaveRequestsService.getStats(employeeId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leaveRequestsService.findOne(+id);
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
    @Req() req: any,
  ) {
    const userContext = req.user;
    const loginId = userContext?.userId || 'system';

    if (entityId === 'NaN' || isNaN(Number(entityId))) {
      throw new HttpException('Invalid entityId: must be a numeric string. Received "NaN" or non-numeric value.', HttpStatus.BAD_REQUEST);
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

    const result = await this.leaveRequestsService.uploadDocument(documents, refType, +refId, entityType, +entityId);
    return result;
  }

  @Get('entityId/:entityId/refId/:refId/get-files')
  @HttpCode(HttpStatus.OK)
  async getFiles(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('refType') referenceType: ReferenceType,
    @Query('entityType') entityType: EntityType,
  ) {
    if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
      throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
    }
    const files = await this.leaveRequestsService.getAllFiles(entityType, +entityId, +refId, referenceType);
    return files;
  }

  @Get('entityId/:entityId/refId/:refId/download-file')
  @HttpCode(HttpStatus.OK)
  async downloadFile(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('key') key: string,
    @Query('entityType') entityType: EntityType,
    @Res() res: any,
  ) {
    if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
      throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
    }
    await this.leaveRequestsService.validateEntity(entityType, +entityId, +refId);

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

  @Get('entityId/:entityId/refId/:refId/view')
  @HttpCode(HttpStatus.OK)
  async viewFile(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('key') key: string,
    @Query('entityType') entityType: EntityType,
    @Res() res: any,
  ) {
    if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
      throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
    }
    await this.leaveRequestsService.validateEntity(entityType, +entityId, +refId);

    const metaData = await this.documentUploaderService.getMetaData(key);
    const dataStream = await this.documentUploaderService.downloadFile(key);

    res.set({
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
  }

  @Delete('entityId/:entityId/refId/:refId/delete')
  @HttpCode(HttpStatus.OK)
  async deleteFile(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('key') key: string,
    @Query('entityType') entityType: EntityType,
  ) {
    if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
      throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
    }
    const result = await this.leaveRequestsService.deleteDocument(entityType, +entityId, +refId, key);
    return result;
  }
}
