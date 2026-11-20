import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { MeetingRoom } from './meeting-room.entity';
import { MeetingRoomBookingMember } from './meeting-room-booking-member.entity';
import { BookingState } from '../enums/booking-state.enum';

@Entity('meeting_room_bookings')
@Index('IDX_booking_room_date_state', ['roomId', 'bookingDate', 'bookingState'])
@Index('IDX_booking_user_date', ['bookedByLoginId', 'bookingDate'])
@Index('IDX_booking_dept_date', ['department', 'bookingDate'])
export class MeetingRoomBooking extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'room_id', type: 'int' })
  roomId: number;

  @ManyToOne(() => MeetingRoom, (room) => room.bookings, { eager: true })
  @JoinColumn({ name: 'room_id' })
  room: MeetingRoom;

  @Column({ name: 'booked_by_user_id', type: 'varchar', length: 36 })
  bookedByUserId: string;

  @Column({ name: 'booked_by_login_id', type: 'varchar', length: 100 })
  bookedByLoginId: string;

  @Column({ name: 'booked_by_name', type: 'varchar', length: 255 })
  bookedByName: string;

  @Column({ name: 'booked_by_email', type: 'varchar', length: 255, nullable: true })
  bookedByEmail: string | null;

  @Column({ name: 'department', type: 'varchar', length: 100, nullable: true })
  department: string | null;

  @Column({ name: 'booking_date', type: 'date' })
  bookingDate: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'title', type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({
    name: 'booking_state',
    type: 'enum',
    enum: BookingState,
    default: BookingState.BOOKED,
  })
  bookingState: BookingState;

  @Column({ name: 'cancelled_by', type: 'varchar', length: 100, nullable: true })
  cancelledBy: string | null;

  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'last_reminder_sent_at', type: 'datetime', nullable: true })
  lastReminderSentAt: Date | null;

  @OneToMany(() => MeetingRoomBookingMember, (member) => member.booking, {
    cascade: true,
    eager: true,
  })
  members: MeetingRoomBookingMember[];
}
