import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MeetingRoomService } from '../services/meeting-room.service';
import { CreateMeetingRoomDto } from '../dto/create-meeting-room.dto';
import { CheckAvailabilityQueryDto } from '../dto/check-availability.dto';
import { CreateBookingDto } from '../dto/create-booking.dto';
import { QueryBookingsDto } from '../dto/query-bookings.dto';

@ApiTags('Meeting Rooms')
@Controller('meeting-rooms')
@UseGuards(JwtAuthGuard)
export class MeetingRoomController {
  constructor(private readonly meetingRoomService: MeetingRoomService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new meeting room (Admin only)' })
  async createRoom(@Body() dto: CreateMeetingRoomDto, @Req() req: any) {
    return await this.meetingRoomService.createRoom(dto, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'List all active meeting rooms' })
  async getAllRooms() {
    return await this.meetingRoomService.getAllRooms();
  }

  @Get('availability')
  @ApiOperation({ summary: 'Check meeting room availability for a date & time range' })
  async checkAvailability(@Query() query: CheckAvailabilityQueryDto) {
    return await this.meetingRoomService.checkAvailability(query);
  }

  @Post('bookings')
  @ApiOperation({ summary: 'Book a meeting room slot and invite members via email' })
  async createBooking(@Body() dto: CreateBookingDto, @Req() req: any) {
    return await this.meetingRoomService.createBooking(dto, req.user);
  }

  @Get('bookings/my')
  @ApiOperation({ summary: 'Get slots booked by the logged-in user' })
  async getMyBookings(@Query() query: QueryBookingsDto, @Req() req: any) {
    return await this.meetingRoomService.getMyBookings(req.user, query);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Get organization-wide or department-wide booked slots' })
  async getScopedBookings(@Query() query: QueryBookingsDto, @Req() req: any) {
    return await this.meetingRoomService.getScopedBookings(req.user, query);
  }

  @Post('bookings/:id/remind')
  @ApiOperation({ summary: 'Send reminder email to all members of an OPEN booking' })
  async sendReminder(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return await this.meetingRoomService.sendReminder(id, req.user);
  }

  @Patch('bookings/:id/cancel')
  @ApiOperation({
    summary:
      'Cancel an OPEN booking and notify members. Admin can cancel any open slot. The person who booked it can delete it only before the slot starts.',
  })
  async cancelBooking(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return await this.meetingRoomService.cancelBooking(id, req.user);
  }
}
