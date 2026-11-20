import { Entity, Column, PrimaryGeneratedColumn, Unique, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { MeetingRoomBooking } from './meeting-room-booking.entity';

@Entity('meeting_rooms')
@Unique('UQ_meeting_room_floor_number', ['floorNumber', 'roomNumber'])
export class MeetingRoom extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'floor_number', type: 'varchar', length: 50 })
  floorNumber: string;

  @Column({ name: 'room_number', type: 'varchar', length: 100 })
  roomNumber: string;

  @Column({
    name: 'dimension_sq_ft',
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => (value !== null && value !== undefined ? Number(value) : 0),
    },
  })
  dimensionSqFt: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => MeetingRoomBooking, (booking) => booking.room)
  bookings: MeetingRoomBooking[];
}
