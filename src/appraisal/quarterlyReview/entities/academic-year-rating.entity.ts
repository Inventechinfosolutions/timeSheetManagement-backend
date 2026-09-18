import { Entity, Column, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/core/models/base.entity';

@Entity('academic_year_ratings')
@Unique(['employeeId', 'academicYear'])
export class AcademicYearRating extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'employee_id', type: 'varchar', length: 100 })
  employeeId!: string;

  @Column({ name: 'academic_year', type: 'varchar', length: 50 })
  academicYear!: string;

  @Column({ name: 'q1_rating', type: 'varchar', length: 50, nullable: true })
  q1Rating!: string | null;

  @Column({ name: 'q2_rating', type: 'varchar', length: 50, nullable: true })
  q2Rating!: string | null;

  @Column({ name: 'q3_rating', type: 'varchar', length: 50, nullable: true })
  q3Rating!: string | null;

  @Column({ name: 'q4_rating', type: 'varchar', length: 50, nullable: true })
  q4Rating!: string | null;

  @Column({ name: 'overall_rating', type: 'decimal', precision: 3, scale: 1, nullable: true })
  overallRating!: number | null;

  @Column({ name: 'evaluated_quarters_count', type: 'int', default: 0 })
  evaluatedQuartersCount!: number;

  @Column({ name: 'total_quarters', type: 'int', default: 4 })
  totalQuarters!: number;
}
