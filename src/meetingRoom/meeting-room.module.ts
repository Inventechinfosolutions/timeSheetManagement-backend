import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeetingRoom } from './entities/meeting-room.entity';
import { MeetingRoomBooking } from './entities/meeting-room-booking.entity';
import { MeetingRoomBookingMember } from './entities/meeting-room-booking-member.entity';
import { EmployeeDetails } from '../employeeTimeSheet/entities/employeeDetails.entity';
import { MeetingRoomService } from './services/meeting-room.service';
import { MeetingRoomController } from './controllers/meeting-room.controller';
import { MailModule } from '../common/mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MeetingRoom,
      MeetingRoomBooking,
      MeetingRoomBookingMember,
      EmployeeDetails,
    ]),
    MailModule,
  ],
  controllers: [MeetingRoomController],
  providers: [MeetingRoomService],
  exports: [MeetingRoomService],
})
export class MeetingRoomModule {}
