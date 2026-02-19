import { Controller, Get, Post, Body, Query, Delete, Param, Patch, UseInterceptors, UploadedFiles, ParseIntPipe, Req, Res, HttpException, HttpStatus, HttpCode, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
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

  @Get('duration-types')
  getLeaveDurationTypes() {
    return this.leaveRequestsService.getLeaveDurationTypes();
  }

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
  @UseGuards(JwtAuthGuard)
  findAll(
    @Req() req: any,
    @Query('employeeId') employeeId?: string,
    @Query('department') department?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('month') month: string = 'All',
    @Query('year') year: string = 'All',
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const user = req.user;
    let managerName: string | undefined;
    let managerId: string | undefined;

    const roleUpper = (user?.role || '').toUpperCase();
    if (user && (user.userType === 'MANAGER' || roleUpper.includes('MNG') || roleUpper.includes('MANAGER'))) {
        managerName = user.aliasLoginName;
        managerId = user.loginId;
    }

    return this.leaveRequestsService.findUnifiedRequests({
      employeeId,
      department,
      status,
      search,
      month,
      year,
      page,
      limit,
      managerName,
      managerId
    });
  }

  @Get('employee/:employeeId')
  findByEmployeeId(
    @Param('employeeId') employeeId: string,
    @Query('status') status?: string,
    @Query('month') month: string = 'All',
    @Query('year') year: string = 'All',
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.leaveRequestsService.findUnifiedRequests({
      employeeId,
      status,
      month,
      year,
      page,
      limit
    });
  }

  @Get('monthly-details/:month/:year')
  @UseGuards(JwtAuthGuard)
  async findAllMonthlyDetails(
    @Req() req: any,
    @Param('month') month: string,
    @Param('year') year: string,
    @Query('status') status?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const user = req.user;
    let managerName: string | undefined;
    let managerId: string | undefined;

    const roleUpper = (user?.role || '').toUpperCase();
    if (user && (user.userType === 'MANAGER' || roleUpper.includes('MNG') || roleUpper.includes('MANAGER'))) {
        managerName = user.aliasLoginName;
        managerId = user.loginId;
    }

    return this.leaveRequestsService.findUnifiedRequests({ 
      month, 
      year, 
      status, 
      page, 
      limit, 
      managerName, 
      managerId 
    });
  }

  @Get('monthly-details/:employeeId/:month/:year')
  async findEmployeeMonthlyDetails(
    @Param('employeeId') employeeId: string,
    @Param('month') month: string,
    @Param('year') year: string,
    @Query('status') status?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.leaveRequestsService.findUnifiedRequests({ employeeId, month, year, status, page, limit });
  }

  @Get('notifications/unread')
  @UseGuards(JwtAuthGuard)
  findUnread(@Req() req: any) {
    const user = req.user;
    const isManager = user?.userType === 'MANAGER';
    return this.leaveRequestsService.findUnread(isManager ? user.aliasLoginName : undefined);
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
  @UseGuards(JwtAuthGuard)
  markAllAsRead(@Req() req: any) {
    const user = req.user;
    const isManager = user?.userType === 'MANAGER';
    return this.leaveRequestsService.markAllAsRead(isManager ? user.aliasLoginName : undefined);
  }

  @Post('employee/:employeeId/notifications/mark-all-read')
  markAllEmployeeUpdatesRead(@Param('employeeId') employeeId: string) {
    return this.leaveRequestsService.markAllEmployeeUpdatesRead(employeeId);
  }

  @Delete(':id/RequestDeleted')
  remove(@Param('id') id: string) {
    return this.leaveRequestsService.remove(+id);
  }

  @Post(':id/update-status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: 'Approved' | 'Rejected' | 'Cancelled' | 'Cancellation Approved',
    @Req() req: any
  ) {
    const user = req.user;
    const reviewerName = user?.aliasLoginName || user?.fullName || 'Admin';
    const reviewerEmail = user?.loginId || user?.email;
    return this.leaveRequestsService.updateStatus(+id, status, undefined, reviewerName, reviewerEmail);
  }

  @Patch(':id/:employeeId/clear-attendance')
  @UseGuards(JwtAuthGuard)
  clearAttendance(@Param('id') id: string, @Param('employeeId') employeeId: string) {
    return this.leaveRequestsService.clearAttendanceForRequest(+id);
  }

  @Patch(':id/modify')
  @UseGuards(JwtAuthGuard)
  modifyRequest(
    @Param('id') id: string,
    @Body() updateData: { title?: string; description?: string; firstHalf?: string; secondHalf?: string; employeeId?: string },
    @Req() req: any,
  ) {
    const employeeId = updateData.employeeId || req.user.id || req.user.employeeId;
    return this.leaveRequestsService.modifyRequest(+id, employeeId, updateData);
  }

  @Post(':id/request-modified')
  createModification(
    @Param('id') id: string,
    @Body() data: { fromDate: string; toDate: string; sourceRequestId: number; sourceRequestType: string },
  ) {
    return this.leaveRequestsService.createModification(+id, data);
  }

  @Patch(':id/cancel-approved')
  async cancelApproved(@Param('id') id: string, @Body('employeeId') employeeId: string) {
    return this.leaveRequestsService.cancelApprovedRequest(+id, employeeId);
  }

  @Patch(':id/reject-cancellation')
  @UseGuards(JwtAuthGuard)
  async rejectCancellation(
    @Param('id') id: string, 
    @Body('employeeId') employeeId: string,
    @Req() req: any
  ) {
    const user = req.user;
    const reviewerName = user?.aliasLoginName || user?.fullName || 'Admin';
    const reviewerEmail = user?.loginId || user?.email;
    return this.leaveRequestsService.rejectCancellation(+id, employeeId, reviewerName, reviewerEmail);
  }

  @Patch(':id/undo-modification')
  async undoModificationRequest(@Param('id') id: number, @Body('employeeId') employeeId: string) {
    return this.leaveRequestsService.undoModificationRequest(id, employeeId);
  }

  @Get(':id/cancellable-dates')
  @UseGuards(JwtAuthGuard)
  async getCancellableDates(
    @Param('id') id: string, 
    @Query('employeeId') employeeId: string,
    @Req() req: any
  ) {
    return this.leaveRequestsService.getCancellableDates(+id, employeeId, req.user);
  }

  @Patch(':id/cancel-dates')
  @UseGuards(JwtAuthGuard)
  async cancelApprovedDates(
    @Param('id') id: string, 
    @Body('employeeId') employeeId: string, 
    @Body('dates') dates: string[],
    @Req() req: any
  ) {
    return this.leaveRequestsService.cancelApprovedDates(
      +id,
      employeeId,
      dates,
      req.user
    );
  }

  @Patch(':id/undo-cancellation')
  async undoCancellation(@Param('id') id: string, @Body('employeeId') employeeId: string) {
    // Logic handled in service
    return this.leaveRequestsService.undoCancellationRequest(+id, employeeId);
  }

  @Get('balance/:employeeId')
  getLeaveBalance(
    @Param('employeeId') employeeId: string,
    @Query('year') year: string,
  ) {
    const y = year || String(new Date().getFullYear());
    return this.leaveRequestsService.getLeaveBalance(employeeId, y);
  }

  @Get('monthly-balance/:employeeId')
  getMonthlyLeaveBalance(
    @Param('employeeId') employeeId: string,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.leaveRequestsService.getMonthlyLeaveBalance(
      employeeId,
      Number(month),
      Number(year),
    );
  }

  @Get('stats/:employeeId')
  getStats(
    @Param('employeeId') employeeId: string,
    @Query('month') month: string = 'All',
    @Query('year') year: string = 'All',
  ) {
    return this.leaveRequestsService.getStats(employeeId, month, year);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leaveRequestsService.findOne(+id);
  }

  @Patch('parent-update')
  async updateParentRequest(
    @Body('parentId', ParseIntPipe) parentId: number, 
    @Body('duration', ParseIntPipe) duration: number, 
    @Body('fromDate') fromDate: string, 
    @Body('toDate') toDate: string
  ) {
    return this.leaveRequestsService.updateParentRequest(parentId, duration, fromDate, toDate);
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
