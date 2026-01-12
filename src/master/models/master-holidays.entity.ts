import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

@Entity('master_holidays')
export class MasterHolidays extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  type: string;

  @Column({ type: 'boolean', default: false })
  isWeekendHoliday: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  documentUrl: string;
}
