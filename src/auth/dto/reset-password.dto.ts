import { IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator';

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  loginId: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  newPassword: string;

  @IsString()
  @IsOptional()
  confirmPassword?: string;

  @IsString()
  @IsOptional()
  token?: string;
}
