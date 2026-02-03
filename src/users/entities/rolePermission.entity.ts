import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * A RolePermission entity.
 */
@Entity('role_permission')
export class RolePermission extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'role_id' })
  roleId: number;

  @Column({ name: 'permission_id' })
  permissionId: string;

  @Column({ name: 'value_yn' })
  valueYn: boolean;
}
