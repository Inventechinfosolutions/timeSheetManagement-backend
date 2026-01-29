import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

@Entity('master_holidays')
@Index('IDX_MASTER_HOLIDAYS_DATE', ['date'], { unique: true })
export class MasterHolidays extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'varchar', length: 100 })
  name: string;
}
