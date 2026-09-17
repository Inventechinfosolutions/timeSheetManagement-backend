import { Controller, Get, Post, Delete, Body, Param, Query, Req, Res, UseGuards, HttpStatus, HttpCode, Logger, UseInterceptors, UploadedFiles, HttpException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { QuarterlyReviewService } from '../services/quarterly-review.service';
import { CreateQuarterlyReviewDto } from '../dto/create-quarterly-review.dto';
import { RequestQuarterlyReviewAccessDto, RejectAccessRequestDto } from '../dto/request-access.dto';
import { AssignQuarterlyReviewDto, ActionAccessRequestDto } from '../dto/assign-quarterly-review.dto';
import { RevealRatingDto } from '../dto/reveal-rating.dto';
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
    try {
      return {
        success: true,
        data: {
          quarter: this.quarterlyReviewService.getCurrentQuarter(),
        },
      };
    } catch (error: any) {
      this.logger.error(`[getCurrentQuarter] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to determine current quarter',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('assignable-employees')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get list of employees assignable by the current user' })
  async getAssignableEmployees(@Req() req: any, @Query('quarter') quarter?: string) {
    try {
      const list = await this.quarterlyReviewService.getAssignableEmployees(req.user, quarter);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: list,
      };
    } catch (error: any) {
      this.logger.error(`[getAssignableEmployees] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch assignable employees',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('assigned-by-me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get list of reviews assigned to employees by the current manager/admin' })
  async getAssignedByMe(@Req() req: any, @Query('quarter') quarter?: string) {
    try {
      this.logger.log(`Fetching reviews assigned by user ${req.user.loginId}, quarter=${quarter || 'all'}`);
      const list = await this.quarterlyReviewService.getAssignedReviewsByManager(req.user, quarter);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: list,
      };
    } catch (error: any) {
      this.logger.error(`[getAssignedByMe] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch assigned reviews',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('assignments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get list of reviews assigned to employees by the current manager/admin' })
  async getAssignments(@Req() req: any, @Query('quarter') quarter?: string) {
    return this.getAssignedByMe(req, quarter);
  }

  @Post(['assign', 'assignments'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign quarterly review to employee(s) (Manager/Admin/CEO)' })
  async assignQuarterlyReview(@Req() req: any, @Body() dto: AssignQuarterlyReviewDto) {
    try {
      this.logger.log(`Assigning review: employeeId=${dto.employeeId}, employeeIds=${dto.employeeIds}, assignToAll=${dto.assignToAll}, quarter=${dto.quarter} by ${req.user?.loginId}`);
      const result = await this.quarterlyReviewService.assignQuarterlyReview(req.user, dto);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: result.message,
        data: result.data,
      };
    } catch (error: any) {
      this.logger.error(`[assignQuarterlyReview] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to assign quarterly review',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('my-assigned-reviews')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get assigned reviews for the logged-in user' })
  async getMyAssignedReviews(@Req() req: any) {
    try {
      const employeeId = req.user.loginId;
      this.logger.log(`Fetching assigned reviews for user ${employeeId}`);
      const assignments = await this.quarterlyReviewService.getMyReviewAssignments(employeeId);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: assignments,
      };
    } catch (error: any) {
      this.logger.error(`[getMyAssignedReviews] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch review assignments',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all quarterly reviews for logged-in employee' })
  async findAll(
    @Req() req: any,
    @Query('financialYear') financialYear?: string,
    @Query('quarter') quarter?: string,
  ) {
    try {
      const employeeId = req.user.loginId;
      const revealToken = (req.headers['x-reveal-token'] as string) || undefined;
      this.logger.log(
        `Fetching all reviews for employee ${employeeId}${financialYear ? ` | FY: ${financialYear}` : ''}${quarter ? ` | Quarter: ${quarter}` : ''}`
      );
      const result = await this.quarterlyReviewService.findAllForEmployee(employeeId, financialYear, quarter, revealToken);
      const reviews = Array.isArray(result) ? result : (result?.reviews || []);
      const summary = result?.summary || null;
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: reviews,
        summary,
      };
    } catch (error: any) {
      this.logger.error(`[findAll] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch quarterly reviews',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('quarter/:quarter')
  @ApiOperation({ summary: 'Get quarterly review by quarter' })
  async findOne(@Req() req: any, @Param('quarter') quarter: string) {
    try {
      const employeeId = req.user.loginId;
      const revealToken = (req.headers['x-reveal-token'] as string) || undefined;
      this.logger.log(`Fetching review for employee ${employeeId}, quarter ${quarter}`);
      const review = await this.quarterlyReviewService.findOneByQuarter(employeeId, quarter, revealToken);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: review,
      };
    } catch (error: any) {
      this.logger.error(`[findOne] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch quarterly review',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('reveal-rating')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify registered credentials and securely reveal final rating for 2 minutes' })
  async revealRating(@Req() req: any, @Body() dto: RevealRatingDto) {
    try {
      this.logger.log(`Reveal rating requested by ${req.user?.loginId} for reviewId=${dto.reviewId || dto.quarter}`);
      const result = await this.quarterlyReviewService.verifyAndRevealRating(req.user, dto);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Final rating revealed successfully. Visible for 2 minutes.',
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`[revealRating] Error: ${error.message}`, error.stack);
      const httpStatus = error instanceof HttpException ? error.getStatus() : (typeof error?.getStatus === 'function' ? error.getStatus() : null);
      if (httpStatus) throw error;
      throw new HttpException(
        error.message || 'Failed to verify credentials for final rating',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update quarterly review (Save Draft or Submit)' })
  async saveOrSubmit(@Req() req: any, @Body() dto: CreateQuarterlyReviewDto) {
    try {
      const employeeId = req.user.loginId;
      const username = req.user.aliasLoginName || employeeId;
      this.logger.log(`Saving or submitting quarterly review for employee ${employeeId}`);
      const review = await this.quarterlyReviewService.saveOrSubmit(employeeId, dto, username);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: review,
      };
    } catch (error: any) {
      this.logger.error(`[saveOrSubmit] Error: ${error.message}`, error.stack);
      const httpStatus = error instanceof HttpException ? error.getStatus() : (typeof error?.getStatus === 'function' ? error.getStatus() : null);
      if (httpStatus) throw error;
      throw new HttpException(
        error.message || 'Failed to save/submit quarterly review',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('start-edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition review and assignment from Not Started to Draft when employee starts edit' })
  async startEdit(@Req() req: any, @Body('quarter') quarter: string) {
    try {
      const employeeId = req.user.loginId;
      const username = req.user.aliasLoginName || employeeId;
      this.logger.log(`Starting edit for employee ${employeeId}, quarter: ${quarter}`);
      const review = await this.quarterlyReviewService.startEdit(employeeId, quarter, username);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: review,
      };
    } catch (error: any) {
      this.logger.error(`[startEdit] Error: ${error.message}`, error.stack);
      const httpStatus = error instanceof HttpException ? error.getStatus() : (typeof error?.getStatus === 'function' ? error.getStatus() : null);
      if (httpStatus) throw error;
      throw new HttpException(
        error.message || 'Failed to start editing quarterly review',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
    } catch (error: any) {
      this.logger.error(`Error uploading document: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Error uploading document',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
    } catch (error: any) {
      this.logger.error(`Error fetching files: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch files',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
    } catch (error: any) {
      this.logger.error(`Error downloading file: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to download file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
    } catch (error: any) {
      this.logger.error(`Error viewing file: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to view file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete or withdraw a quarterly review by ID or Quarter' })
  async deleteOrWithdraw(@Req() req: any, @Param('id') id: string) {
    try {
      const employeeId = req.user.loginId;
      this.logger.log(`Employee ${employeeId} requesting delete/withdraw for review id/quarter=${id}`);
      const result = await this.quarterlyReviewService.deleteOrWithdraw(employeeId, id);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: result.message,
        data: result.data || null,
      };
    } catch (error: any) {
      this.logger.error(`[deleteOrWithdraw] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to delete/withdraw review',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
      this.logger.log(`Deleting quarterly review file: entityId=${entityId}, refId=${refId}, key=${key}`);
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
      }
      if (!key || key === 'all') {
        return await this.quarterlyReviewService.deleteProjectFiles(entityType, +entityId, +refId);
      }
      return await this.quarterlyReviewService.deleteDocument(entityType, +entityId, +refId, key);
    } catch (error: any) {
      this.logger.error(`Error deleting file: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to delete file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('entityId/:entityId/refId/:refId/delete-all')
  @HttpCode(HttpStatus.OK)
  async deleteProjectFiles(
    @Param('entityId') entityId: string,
    @Param('refId') refId: string,
    @Query('entityType') entityType: EntityType,
  ) {
    try {
      this.logger.log(`Deleting all project files: entityId=${entityId}, refId=${refId}`);
      if (isNaN(Number(entityId)) || isNaN(Number(refId))) {
        throw new HttpException('Invalid entityId or refId: must be numeric.', HttpStatus.BAD_REQUEST);
      }
      return await this.quarterlyReviewService.deleteProjectFiles(entityType, +entityId, +refId);
    } catch (error: any) {
      this.logger.error(`Error deleting project files: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to delete project files',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/download-pdf')
  @ApiOperation({ summary: 'Download completed quarterly review PDF report' })
  async downloadPdf(
    @Req() req: any,
    @Param('id') id: string,
    @Res() res: any,
  ) {
    try {
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
    } catch (error: any) {
      this.logger.error(`[downloadPdf] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to download review PDF',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('request-access')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request 2-day access extension to reopen quarterly review' })
  async requestAccess(@Req() req: any, @Body() dto: RequestQuarterlyReviewAccessDto) {
    try {
      const employeeId = req.user.loginId;
      const username = req.user.aliasLoginName || req.user.userName || employeeId;
      const rawRole = String(req.user.userType || req.user.role || '').toUpperCase();
      const isManager = rawRole === 'MANAGER' || (req.user.designation && req.user.designation.toLowerCase().includes('manager'));
      const userRole = isManager ? 'MANAGER' : 'EMPLOYEE';

      this.logger.log(`Employee ${employeeId} (${userRole}) requesting access for quarter ${dto.quarter}`);
      const result = await this.quarterlyReviewService.requestAccess(
        employeeId,
        dto.quarter,
        dto.reason || '',
        userRole,
        username,
        dto.assignmentId ? Number(dto.assignmentId) : undefined,
      );
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: result.message,
        data: result.data,
      };
    } catch (error: any) {
      this.logger.error(`[requestAccess] Error: ${error.message}`, error.stack);
      const httpStatus = error instanceof HttpException ? error.getStatus() : (typeof error?.getStatus === 'function' ? error.getStatus() : null);
      if (httpStatus) throw error;
      throw new HttpException(
        error.message || 'Failed to request review access',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('access-requests')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get quarterly review access requests for viewer' })
  async getAccessRequests(@Req() req: any, @Query('quarter') quarter?: string) {
    try {
      const viewerId = req.user.loginId;
      const viewerName = req.user.aliasLoginName || req.user.userName || viewerId;
      const rawRole = String(req.user.userType || req.user.role || '').toUpperCase();
      const isManager = rawRole === 'MANAGER' || (req.user.designation && req.user.designation.toLowerCase().includes('manager'));
      const viewerRole = rawRole === 'ADMIN' ? 'ADMIN' : rawRole === 'CEO' ? 'CEO' : isManager ? 'MANAGER' : 'EMPLOYEE';

      this.logger.log(`Fetching access requests for viewer ${viewerId} (${viewerRole})`);
      const requests = await this.quarterlyReviewService.getAccessRequests(viewerId, viewerRole, viewerName, quarter);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data: requests,
      };
    } catch (error: any) {
      this.logger.error(`[getAccessRequests] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch access requests',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('access-requests/:id/action')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject review access request' })
  async actionAccessRequest(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ActionAccessRequestDto,
  ) {
    try {
      this.logger.log(`Actioning access request ${id} with action ${dto.action} by ${req.user.loginId}`);
      const result = await this.quarterlyReviewService.actionAccessRequest(+id, req.user, dto);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: result.message,
        data: result.data,
      };
    } catch (error: any) {
      this.logger.error(`[actionAccessRequest] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to action access request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('access-requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve access request and grant 2 days access' })
  async approveAccessRequest(@Req() req: any, @Param('id') id: string) {
    try {
      const approverId = req.user.loginId;
      const approverName = req.user.aliasLoginName || req.user.userName || approverId;
      const rawRole = String(req.user.userType || req.user.role || '').toUpperCase();
      const isManager = rawRole === 'MANAGER' || (req.user.designation && req.user.designation.toLowerCase().includes('manager'));
      const approverRole = rawRole === 'ADMIN' ? 'ADMIN' : rawRole === 'CEO' ? 'CEO' : isManager ? 'MANAGER' : 'EMPLOYEE';

      this.logger.log(`Approver ${approverId} (${approverRole}) approving request ${id}`);
      const result = await this.quarterlyReviewService.approveAccessRequest(+id, approverId, approverName, approverRole);
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: result.message,
        data: result.data,
      };
    } catch (error: any) {
      this.logger.error(`[approveAccessRequest] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to approve access request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('access-requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject access request' })
  async rejectAccessRequest(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RejectAccessRequestDto,
  ) {
    try {
      const approverId = req.user.loginId;
      const approverName = req.user.aliasLoginName || req.user.userName || approverId;
      const rawRole = String(req.user.userType || req.user.role || '').toUpperCase();
      const isManager = rawRole === 'MANAGER' || (req.user.designation && req.user.designation.toLowerCase().includes('manager'));
      const approverRole = rawRole === 'ADMIN' ? 'ADMIN' : rawRole === 'CEO' ? 'CEO' : isManager ? 'MANAGER' : 'EMPLOYEE';

      this.logger.log(`Approver ${approverId} (${approverRole}) rejecting request ${id}`);
      const result = await this.quarterlyReviewService.rejectAccessRequest(
        +id,
        approverId,
        approverName,
        approverRole,
        dto.rejectionReason,
      );
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: result.message,
        data: result.data,
      };
    } catch (error: any) {
      this.logger.error(`[rejectAccessRequest] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to reject access request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
