import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('password_reset_tokens')
@Index('IDX_PASSWORD_RESET_TOKEN', ['token'], { unique: true })
@Index('IDX_PASSWORD_RESET_LOGIN_ID', ['loginId'])
@Index('IDX_PASSWORD_RESET_EXPIRES_AT', ['expiresAt'])
@Index('IDX_PASSWORD_RESET_TOKEN_VERIFIED', ['token', 'verified'])
export class PasswordResetToken {
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

  @CreateDateColumn()
  createdAt: Date;
}
