import {
  Entity,
  Column,
  PrimaryGeneratedColumn,

} from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

@Entity('notifications')
export class Notification  extends BaseEntity{
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: 'general' }) // 'general', 'alert', 'success'
  type: string;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  
}
