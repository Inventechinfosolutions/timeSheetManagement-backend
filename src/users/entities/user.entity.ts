import { BeforeInsert, BeforeUpdate, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { UserStatus } from '../enums/user-status.enum';
import { UserType } from '../enums/user-type.enum';
import { BaseEntity } from '../../common/entities/base.entity';


@Entity('users')
@Index('IDX_UNIQUE_LOGIN_ID', ['loginId'], { unique: true })
export class User extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  loginId: string;

  @Column({ nullable: true })
  aliasLoginName: string;

  @Column({
    type: 'enum',
    enum: UserType,
  })
  userType: UserType;

  @Column({ select: false, nullable: false })
  password: string;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.DRAFT,
    nullable: false,
  })
  status: UserStatus;

  @Column({ nullable: true })
  lastLoggedIn: Date;

  @Column({ default: false, nullable: false })
  changePasswordRequired: boolean;

  @Column({ nullable: true })
  lastPasswordChanged: Date;

  @Column({ default: true, nullable: true })
  resetRequired: boolean;

  @Column({ nullable: true })
  mobileVerification: boolean;

  @Column({
    type: 'enum',
    enum: UserType,
    nullable: true,
  })
  role: UserType;

}
