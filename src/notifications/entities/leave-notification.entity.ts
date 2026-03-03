import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';
import { LeaveNotificationStatus } from '../../employeeTimeSheet/enums/leave-notification-status.enum';

@Entity('leave_notifications')
export class LeaveNotification extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'employee_id', type: 'varchar', length: 255 })
    employeeId: string;

    @Column({ name: 'employee_name', type: 'varchar', length: 255 })
    employeeName: string;

    @Column({ name: 'request_type', type: 'varchar', length: 255 })
    requestType: string;

    @Column({ name: 'from_date', type: 'date' })
    fromDate: string;

    @Column({ name: 'to_date', type: 'date' })
    toDate: string;

    @Column({
        type: 'enum',
        enum: LeaveNotificationStatus,
        default: LeaveNotificationStatus.PENDING,
    })
    status: LeaveNotificationStatus;

    @Column({ name: 'is_read', type: 'tinyint', nullable: true })
    isRead: number;
}
