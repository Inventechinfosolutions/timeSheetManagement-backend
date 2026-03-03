import { Controller, Get, Post, Body, Query, Delete, Param, Patch, UseInterceptors, UploadedFiles, ParseIntPipe, Req, Res, HttpException, HttpStatus, HttpCode, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { LeaveRequestsService } from '../services/leave-requests.service';
import { LeaveRequestDto } from '../dto/leave-request.dto';
import { DocumentUploaderService } from '../../common/document-uploader/services/document-uploader.service';
import { FileService } from '../../common/core/utils/fileType.utils';
import { EntityType, ReferenceType } from '../../common/document-uploader/models/documentmetainfo.model';
import { Readable } from 'stream';
import { UserType } from 'src/users/enums/user-type.enum';

@Controller('leave-requests')
export class LeaveRequestsController {
  private readonly logger = new Logger(LeaveRequestsController.name);

  constructor(
    private readonly leaveRequestsService: LeaveRequestsService,
    private readonly documentUploaderService: DocumentUploaderService,
    private readonly fileService: FileService,
  ) { }

  @Get('duration-types')
  getLeaveDurationTypes() {
    try {
      this.logger.log('Fetching leave duration types');
      return this.leaveRequestsService.getLeaveDurationTypes();
    } catch (error) {
      this.logger.error(`Error fetching leave duration types: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post(':employeeId/leave-requests')
  create(@Param('employeeId') employeeId: string, @Body() body: LeaveRequestDto) {
    try {
      this.logger.log(`Creating leave request for employee: ${employeeId}`);
      body.employeeId = employeeId;
      return this.leaveRequestsService.create(body);
    } catch (error) {
      this.logger.error(`Error creating leave request for ${employeeId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post()
  createRoot(@Body() body: LeaveRequestDto) {
    try {
      this.logger.log('Creating leave request from root');
      return this.leaveRequestsService.create(body);
    } catch (error) {
      this.logger.error(`Error creating leave request (root): ${error.message}`, error.stack);
      throw error;
    }
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
    try {
      this.logger.log(`Fetching all leave requests - Month: ${month}, Year: ${year}`);
      const user = req.user;
      let managerName: string | undefined;
      let managerId: string | undefined;

      const roleUpper = (user?.role || '').toUpperCase();
      if (user && (user.userType === UserType.MANAGER || roleUpper.includes('MNG') || roleUpper.includes(UserType.MANAGER))) {
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
    } catch (error) {
      this.logger.error(`Error fetching leave requests: ${error.message}`, error.stack);
      throw error;
    }
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
    try {
      this.logger.log(`Fetching leave requests for employee: ${employeeId}`);
      return this.leaveRequestsService.findUnifiedRequests({
        employeeId,
        status,
        month,
        year,
        page,
        limit
      });
    } catch (error) {
      this.logger.error(`Error fetching leave requests for ${employeeId}: ${error.message}`, error.stack);
      throw error;
    }
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
    try {
      this.logger.log(`Fetching all monthly leave details: ${month}/${year}`);
      const user = req.user;
      let managerName: string | undefined;
      let managerId: string | undefined;

      const roleUpper = (user?.role || '').toUpperCase();
      if (user && (user.userType === UserType.MANAGER || roleUpper.includes(UserType.MANAGER))) {
        managerName = user.aliasLoginName;
        managerId = user.loginId;
      }

      return await this.leaveRequestsService.findUnifiedRequests({
        month,
        year,
        status,
        page,
        limit,
        managerName,
        managerId
      });
    } catch (error) {
      this.logger.error(`Error fetching all monthly leave details: ${error.message}`, error.stack);
      throw error;
    }
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
    try {
      this.logger.log(`Fetching monthly leave details for employee ${employeeId}: ${month}/${year}`);
      return await this.leaveRequestsService.findUnifiedRequests({ employeeId, month, year, status, page, limit });
    } catch (error) {
      this.logger.error(`Error fetching monthly leave details: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('notifications/unread')
  @UseGuards(JwtAuthGuard)
  findUnread(@Req() req: any) {
    try {
      const user = req.user;
      this.logger.log(`Fetching unread notifications for user type: ${user?.userType}`);
      const isManager = user?.userType === UserType.MANAGER;
      return this.leaveRequestsService.findUnread(isManager ? user.aliasLoginName : undefined);
    } catch (error) {
      this.logger.error(`Error fetching unread notifications: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('employee/:employeeId/updates')
  findEmployeeUpdates(@Param('employeeId') employeeId: string) {
    try {
      this.logger.log(`Fetching leave updates for employee: ${employeeId}`);
      return this.leaveRequestsService.findEmployeeUpdates(employeeId);
    } catch (error) {
      this.logger.error(`Error fetching employee updates for ${employeeId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch('notifications/:id/read')
  markAsRead(@Param('id') id: string) {
    try {
      this.logger.log(`Marking notification as read: ${id}`);
      return this.leaveRequestsService.markAsRead(+id);
    } catch (error) {
      this.logger.error(`Error marking notification ${id} as read: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch('employee/notifications/:id/read')
  markEmployeeRead(@Param('id') id: string) {
    try {
      this.logger.log(`Marking employee notification as read: ${id}`);
      return this.leaveRequestsService.markEmployeeUpdateRead(+id);
    } catch (error) {
      this.logger.error(`Error marking employee notification ${id} as read: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('notifications/mark-all-read')
  @UseGuards(JwtAuthGuard)
  markAllAsRead(@Req() req: any) {
    try {
      const user = req.user;
      this.logger.log(`Marking all notifications as read for user: ${user?.aliasLoginName || 'system'}`);
      const isManager = user?.userType === UserType.MANAGER;
      return this.leaveRequestsService.markAllAsRead(isManager ? user.aliasLoginName : undefined);
    } catch (error) {
      this.logger.error(`Error marking all notifications as read: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('employee/:employeeId/notifications/mark-all-read')
  markAllEmployeeUpdatesRead(@Param('employeeId') employeeId: string) {
    try {
      this.logger.log(`Marking all updates as read for employee: ${employeeId}`);
      return this.leaveRequestsService.markAllEmployeeUpdatesRead(employeeId);
    } catch (error) {
      this.logger.error(`Error marking all updates read for ${employeeId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete(':id/RequestDeleted')
  remove(@Param('id') id: string) {
    try {
      this.logger.log(`Deleting leave request: ${id}`);
      return this.leaveRequestsService.remove(+id);
    } catch (error) {
      this.logger.error(`Error deleting leave request ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post(':id/update-status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Req() req: any
  ) {
    try {
      this.logger.log(`Updating leave request ${id} status to ${status}`);
      const user = req.user;
      const reviewerName = user?.aliasLoginName || user?.fullName || 'Admin';
      const reviewerEmail = user?.loginId || user?.email;
      return this.leaveRequestsService.updateStatus(+id, status as any, undefined, reviewerName, reviewerEmail);
    } catch (error) {
      this.logger.error(`Error updating status for request ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch(':id/:employeeId/clear-attendance')
  @UseGuards(JwtAuthGuard)
  clearAttendance(@Param('id') id: string, @Param('employeeId') employeeId: string) {
    try {
      this.logger.log(`Clearing attendance for leave request: ${id}`);
      return this.leaveRequestsService.clearAttendanceForRequest(+id);
    } catch (error) {
      this.logger.error(`Error clearing attendance for request ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch(':id/modify')
  @UseGuards(JwtAuthGuard)
  modifyRequest(
    @Param('id') id: string,
    @Body() updateData: { title?: string; description?: string; firstHalf?: string; secondHalf?: string; employeeId?: string },
    @Req() req: any,
  ) {
    try {
      this.logger.log(`Modifying leave request ID: ${id}`);
      const employeeId = updateData.employeeId || req.user.id || req.user.employeeId;
      return this.leaveRequestsService.modifyRequest(+id, employeeId, updateData);
    } catch (error) {
      this.logger.error(`Error modifying leave request ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post(':id/request-modified')
  createModification(
    @Param('id') id: string,
    @Body() data: { fromDate: string; toDate: string; sourceRequestId: number; sourceRequestType: string },
  ) {
    try {
      this.logger.log(`Creating modification for leave request: ${id}`);
      return this.leaveRequestsService.createModification(+id, data);
    } catch (error) {
      this.logger.error(`Error creating modification for request ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch(':id/cancel-approved')
  async cancelApproved(@Param('id') id: string, @Body('employeeId') employeeId: string) {
    try {
      this.logger.log(`Canceling approved leave request: ${id}`);
      return await this.leaveRequestsService.cancelApprovedRequest(+id, employeeId);
    } catch (error) {
      this.logger.error(`Error canceling approved request ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch(':id/reject-cancellation')
  @UseGuards(JwtAuthGuard)
  async rejectCancellation(
    @Param('id') id: string,
    @Body('employeeId') employeeId: string,
    @Req() req: any
  ) {
    try {
      this.logger.log(`Rejecting cancellation for request: ${id}`);
      const user = req.user;
      const reviewerName = user?.aliasLoginName || user?.fullName || UserType.ADMIN;
      const reviewerEmail = user?.loginId || user?.email;
      return await this.leaveRequestsService.rejectCancellation(+id, employeeId, reviewerName, reviewerEmail);
    } catch (error) {
      this.logger.error(`Error rejecting cancellation for request ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch(':id/undo-modification')
  async undoModificationRequest(@Param('id') id: number, @Body('employeeId') employeeId: string) {
    try {
      this.logger.log(`Undoing modification for request: ${id}`);
      return await this.leaveRequestsService.undoModificationRequest(id, employeeId);
    } catch (error) {
      this.logger.error(`Error undoing modification for request ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(':id/cancellable-dates')
  @UseGuards(JwtAuthGuard)
  async getCancellableDates(
    @Param('id') id: string,
    @Query('employeeId') employeeId: string,
    @Req() req: any
  ) {
    try {
      this.logger.log(`Fetching cancellable dates for request: ${id}`);
      return await this.leaveRequestsService.getCancellableDates(+id, employeeId, req.user);
    } catch (error) {
      this.logger.error(`Error fetching cancellable dates for ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch(':id/cancel-dates')
  @UseGuards(JwtAuthGuard)
  async cancelApprovedDates(
    @Param('id') id: string,
    @Body('employeeId') employeeId: string,
    @Body('dates') dates: string[],
    @Req() req: any
  ) {
    try {
      this.logger.log(`Canceling specific dates for approved request: ${id}`);
      return await this.leaveRequestsService.cancelApprovedDates(
        +id,
        employeeId,
        dates,
        req.user
      );
    } catch (error) {
      this.logger.error(`Error canceling dates for request ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch(':id/undo-cancellation')
  async undoCancellation(@Param('id') id: string, @Body('employeeId') employeeId: string) {
    try {
      this.logger.log(`Undoing cancellation for request: ${id}`);
      return await this.leaveRequestsService.undoCancellationRequest(+id, employeeId);
    } catch (error) {
      this.logger.error(`Error undoing cancellation for request ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('balance/:employeeId')
  getLeaveBalance(
    @Param('employeeId') employeeId: string,
    @Query('year') year: string,
  ) {
    try {
      const y = year || String(new Date().getFullYear());
      this.logger.log(`Fetching leave balance for employee ${employeeId}, Year: ${y}`);
      return this.leaveRequestsService.getLeaveBalance(employeeId, y);
    } catch (error) {
      this.logger.error(`Error fetching leave balance for ${employeeId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('monthly-balance/:employeeId')
  getMonthlyLeaveBalance(
    @Param('employeeId') employeeId: string,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    try {
      this.logger.log(`Fetching monthly leave balance for employee ${employeeId}: ${month}/${year}`);
      return this.leaveRequestsService.getMonthlyLeaveBalance(
        employeeId,
        Number(month),
        Number(year),
      );
    } catch (error) {
      this.logger.error(`Error fetching monthly leave balance for ${employeeId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('stats/:employeeId')
  getStats(
    @Param('employeeId') employeeId: string,
    @Query('month') month: string = 'All',
    @Query('year') year: string = 'All',
  ) {
    try {
      this.logger.log(`Fetching leave stats for employee ${employeeId} - Month: ${month}, Year: ${year}`);
      return this.leaveRequestsService.getStats(employeeId, month, year);
    } catch (error) {
      this.logger.error(`Error fetching leave stats for ${employeeId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    try {
      this.logger.log(`Fetching leave request: ${id}`);
      return this.leaveRequestsService.findOne(+id);
    } catch (error) {
      this.logger.error(`Error fetching leave request ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch('parent-update')
  async updateParentRequest(
    @Body('parentId', ParseIntPipe) parentId: number,
    @Body('duration', ParseIntPipe) duration: number,
    @Body('fromDate') fromDate: string,
    @Body('toDate') toDate: string
  ) {
    try {
      this.logger.log(`Updating parent request ID: ${parentId}`);
      return await this.leaveRequestsService.updateParentRequest(parentId, duration, fromDate, toDate);
    } catch (error) {
      this.logger.error(`Error updating parent request ${parentId}: ${error.message}`, error.stack);
      throw error;
    }
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
    try {
      this.logger.log(`Uploading document for entity: ${entityId}, refId: ${refId}`);
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

      return await this.leaveRequestsService.uploadDocument(documents, refType, +refId, entityType, +entityId);
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
      this.logger.log(`Fetching files for entity: ${entityId}, refId: ${refId}`);
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
      }
      return await this.leaveRequestsService.getAllFiles(entityType, +entityId, +refId, referenceType);
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
    @Query('entityType') entityType: EntityType,
    @Res() res: any,
  ) {
    try {
      this.logger.log(`Downloading file with key: ${key}`);
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
    @Query('entityType') entityType: EntityType,
    @Res() res: any,
  ) {
    try {
      this.logger.log(`Viewing file with key: ${key}`);
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
    } catch (error) {
      this.logger.error(`Error viewing file: ${error.message}`, error.stack);
      throw error;
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
    try {
      this.logger.log(`Deleting file with key: ${key}`);
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
      }
      return await this.leaveRequestsService.deleteDocument(entityType, +entityId, +refId, key);
    } catch (error) {
      this.logger.error(`Error deleting file: ${error.message}`, error.stack);
      throw error;
    }
  }

}
