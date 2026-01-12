import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiPropertyOptional({
    description: 'The employee ID (served as login ID)',
  })
  @IsOptional()
  @IsString()
  loginId?: string;

  @ApiProperty({
    description: 'The new password',
    minLength: 6,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({
    description: 'The activation token from the link',
  })
  @IsOptional()
  @IsString()
  token?: string;
}
