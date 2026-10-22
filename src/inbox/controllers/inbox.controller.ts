import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InboxService } from '../services/inbox.service';
import { SendNoteDto } from '../dto/send-note.dto';
import { QueryInboxDto } from '../dto/query-inbox.dto';
import { InboxFolder } from '../enums/note-permission.enum';

@ApiTags('Inbox')
@ApiBearerAuth()
@Controller('inbox')
@UseGuards(JwtAuthGuard)
export class InboxController {
  private readonly logger = new Logger(InboxController.name);

  constructor(private readonly inboxService: InboxService) {}

  @Get('counts')
  @ApiOperation({ summary: 'Get unified inbox, unread, read, and sent counts for current user' })
  @ApiResponse({ status: 200, description: 'Returns unified inbox counts' })
  async getCounts(@Req() req: any) {
    return await this.inboxService.getInboxCounts(req.user);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread message count for current user inbox' })
  @ApiResponse({ status: 200, description: 'Returns unread count' })
  async getUnreadCount(@Req() req: any) {
    return await this.inboxService.getUnreadCount(req.user);
  }

  @Get()
  @ApiOperation({
    summary: 'Get notes in user inbox with pagination (default: 5 items per page)',
    description: 'Retrieve paginated inbox messages. Accepts folder, isRead, search, fromDate, toDate, page, limit (or pageSize).',
  })
  @ApiResponse({ status: 200, description: 'Returns list of inbox items with pagination metadata' })
  @ApiQuery({ name: 'folder', enum: InboxFolder, required: false, description: 'Folder filter: INBOX (received) or SENT (sent by user)', default: InboxFolder.INBOX })
  @ApiQuery({ name: 'isRead', type: Boolean, required: false, description: 'Filter by read status (true/false)' })
  @ApiQuery({ name: 'search', type: String, required: false, description: 'Search term for sender or note title/content' })
  @ApiQuery({ name: 'fromDate', type: String, required: false, description: 'Filter messages created on or after date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'toDate', type: String, required: false, description: 'Filter messages created on or before date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', type: Number, required: false, description: 'Page number for pagination (starts at 1)', default: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, description: 'Number of items per page (default: 5)', default: 5 })
  async getInbox(@Query() query: QueryInboxDto, @Req() req: any) {
    return await this.inboxService.getInbox(req.user, query);
  }

  @Get('employee/:employeeId')
  @ApiOperation({ summary: 'Get received notes in inbox by specific employee ID' })
  @ApiParam({ name: 'employeeId', type: String, description: 'Target Employee ID' })
  @ApiQuery({ name: 'folder', enum: InboxFolder, required: false, description: 'Folder filter: INBOX or SENT', default: InboxFolder.INBOX })
  @ApiQuery({ name: 'isRead', type: Boolean, required: false, description: 'Filter by read status (true/false)' })
  @ApiQuery({ name: 'search', type: String, required: false, description: 'Search term' })
  @ApiQuery({ name: 'fromDate', type: String, required: false, description: 'From date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'toDate', type: String, required: false, description: 'To date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', type: Number, required: false, description: 'Page number (default: 1)', default: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, description: 'Items per page (default: 5)', default: 5 })
  async getInboxByEmployeeId(
    @Param('employeeId') employeeId: string,
    @Query() query: QueryInboxDto,
    @Req() req: any,
  ) {
    return await this.inboxService.getInboxByEmployeeId(employeeId, query);
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send / Share a note with one or more employees' })
  @ApiResponse({ status: 200, description: 'Note shared and inbox records created' })
  async sendNote(@Body() sendDto: SendNoteDto, @Req() req: any) {
    this.logger.log(`User ${req.user?.aliasLoginName || req.user?.loginId} sending note ${sendDto.notesId} to ${sendDto.recipients?.join(', ')}`);
    return await this.inboxService.sendNote(sendDto, req.user);
  }

  @Patch('mark-all-read')
  @ApiOperation({ summary: 'Mark all inbox messages as read for current user' })
  async markAllAsRead(@Req() req: any) {
    return await this.inboxService.markAllAsRead(req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single inbox note item by ID' })
  async getInboxItem(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return await this.inboxService.getInboxItem(id, req.user);
  }

  @Patch(':id/star')
  @ApiOperation({ summary: 'Toggle starred flag for an inbox note (1 starred, 0 not starred)' })
  async toggleStar(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return await this.inboxService.toggleStar(id, req.user);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark single inbox note item as read' })
  async markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return await this.inboxService.markAsRead(id, req.user);
  }

  @Patch(':id/permission')
  @ApiOperation({ summary: 'Update permission (CanView or CanEdit) for an inbox note recipient' })
  async updatePermission(
    @Param('id', ParseIntPipe) id: number,
    @Body('permission') permission: string,
    @Req() req: any,
  ) {
    return await this.inboxService.updatePermission(id, permission, req.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete inbox message' })
  async deleteInboxItem(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return await this.inboxService.deleteInboxItem(id, req.user);
  }
}
