import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

@Entity('quater')
export class MasterQuaterly extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true, nullable: false })
  quaterLabel: string; // 'Q1', 'Q2', 'Q3', 'Q4'

  @Column({ type: 'varchar', length: 50, nullable: false })
  fromMonth: string; // 'April', 'July', 'October', 'January'

  @Column({ type: 'varchar', length: 50, nullable: false })
  toMonth: string; // 'June', 'September', 'December', 'March'

  @Column({ type: 'varchar', length: 150, nullable: true })
  description: string; // 'April to June'
}
