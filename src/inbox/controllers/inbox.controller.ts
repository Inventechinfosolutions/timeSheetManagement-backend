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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InboxService } from '../services/inbox.service';
import { SendNoteDto } from '../dto/send-note.dto';
import { QueryInboxDto } from '../dto/query-inbox.dto';

@ApiTags('Inbox')
@ApiBearerAuth()
@Controller('inbox')
@UseGuards(JwtAuthGuard)
export class InboxController {
  private readonly logger = new Logger(InboxController.name);

  constructor(private readonly inboxService: InboxService) {}

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread message count for current user inbox' })
  @ApiResponse({ status: 200, description: 'Returns unread count' })
  async getUnreadCount(@Req() req: any) {
    return await this.inboxService.getUnreadCount(req.user);
  }

  @Get()
  @ApiOperation({ summary: 'Get all received notes in user inbox' })
  @ApiResponse({ status: 200, description: 'Returns list of inbox items' })
  async getInbox(@Query() query: QueryInboxDto, @Req() req: any) {
    return await this.inboxService.getInbox(req.user, query);
  }

  @Get('employee/:employeeId')
  @ApiOperation({ summary: 'Get received notes in inbox by specific employee ID' })
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
