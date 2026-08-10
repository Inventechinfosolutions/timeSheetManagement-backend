import { BaseEntity } from 'src/common/core/models/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum ReferenceType {
  PRODUCT_IMG = 'PRODUCT_IMG',
  MASTER_HOLIDAY_DOCUMENT = 'MASTER_HOLIDAY_DOCUMENT',
  EMPLOYEE_PROFILE_PHOTO = 'EMPLOYEE_PROFILE_PHOTO',
  DOCUMENT = 'DOCUMENT',
  PROJECT_DOCUMENT = 'PROJECT_DOCUMENT',
  PROJECT_PHOTO = 'PROJECT_PHOTO',
  QUARTERLY_REVIEW_DOCUMENT = 'QUARTERLY_REVIEW_DOCUMENT',
  // Add more as needed
}

export enum EntityType {
  PRODUCT = 'PRODUCT',
  MASTER_HOLIDAY = 'MASTER_HOLIDAY',
  EMPLOYEE = 'EMPLOYEE',
  LEAVE_REQUEST = 'LEAVE_REQUEST',
  PROJECT = 'PROJECT',
  QUARTERLY_REVIEW = 'QUARTERLY_REVIEW',
  // Add more as needed
}

@Entity('object_store')
export class DocumentMetaInfo extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  refId: number;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  refType: ReferenceType;

  @Column({ nullable: false })
  entityId: number;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  entityType: EntityType;

  @Column({ nullable: true })
  s3Key: string;
}
