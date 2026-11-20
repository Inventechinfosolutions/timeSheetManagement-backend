import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { MeetingRoomBooking } from './meeting-room-booking.entity';

@Entity('meeting_room_booking_members')
@Index('IDX_booking_member_booking', ['bookingId'])
export class MeetingRoomBookingMember extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'booking_id', type: 'int' })
  bookingId: number;

  @ManyToOne(() => MeetingRoomBooking, (booking) => booking.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking: MeetingRoomBooking;

  @Column({ name: 'employee_id', type: 'varchar', length: 100 })
  employeeId: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName: string;

  @Column({ name: 'email', type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'department', type: 'varchar', length: 100, nullable: true })
  department: string | null;

  @Column({ name: 'designation', type: 'varchar', length: 200, nullable: true })
  designation: string | null;
}
