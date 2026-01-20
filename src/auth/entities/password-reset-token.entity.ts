import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('password_reset_tokens')
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
