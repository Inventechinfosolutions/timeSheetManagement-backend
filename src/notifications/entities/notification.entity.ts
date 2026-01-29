import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

@Entity('notifications')
@Index('IDX_NOTIFICATION_EMPLOYEE_ID', ['employeeId'])
@Index('IDX_NOTIFICATION_IS_READ', ['isRead'])
@Index('IDX_NOTIFICATION_EMPLOYEE_READ', ['employeeId', 'isRead'])
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
