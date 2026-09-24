import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/core/models/base.entity';

@Entity('password_reset_tokens')
export class PasswordResetToken extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  loginId: string;

  @Column()
  email: string;

  @Column()
  token: string;

  @Column({ default: false })
  verified: boolean;

  @Column()
  expiresAt: Date;
}
