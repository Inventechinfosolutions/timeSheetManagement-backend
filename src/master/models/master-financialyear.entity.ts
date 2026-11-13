import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

@Entity('financial_year')
export class MasterFinancialYear extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true, nullable: false })
  financialYear: string; // e.g. '2025-2026'

  @Column({ type: 'int', nullable: false })
  fromYear: number; // e.g. 2025

  @Column({ type: 'int', nullable: false })
  toYear: number; // e.g. 2026

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string; // e.g. 'Financial Year 2025-2026'
}
