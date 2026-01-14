import { BaseEntity } from 'src/common/core/models/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum ReferenceType {
  PRODUCT_IMG = 'PRODUCT_IMG',
  MASTER_HOLIDAY_DOCUMENT = 'MASTER_HOLIDAY_DOCUMENT',
  EMPLOYEE_PROFILE_PHOTO = 'EMPLOYEE_PROFILE_PHOTO',
  // Add more as needed
}

export enum EntityType {
  PRODUCT = 'PRODUCT',
  MASTER_HOLIDAY = 'MASTER_HOLIDAY',
  EMPLOYEE = 'EMPLOYEE',
  // Add more as needed
}

@Entity('object_store')
export class DocumentMetaInfo extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  refId: number;

  @Column({
    type: 'enum',
    enum: ReferenceType,
    nullable: false,
  })
  refType: ReferenceType;

  @Column({ nullable: false })
  entityId: number;

  @Column({
    type: 'enum',
    enum: EntityType,
    nullable: false,
  })
  entityType: EntityType;
}
