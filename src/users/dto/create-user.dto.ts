import { IsNotEmpty, MinLength, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserType } from '../enums/user-type.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'John Doe', description: 'The name of the user' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'user@example.com', description: 'Login ID (email or e.g. Inventech for receptionist)' })
  @IsString()
  @IsNotEmpty()
  loginId: string;

  @ApiProperty({ example: 'password123', description: 'Optional; for Receptionist defaults to Invent123', minLength: 6 })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiProperty({ example: 'RECEPTIONIST', description: 'Role; RECEPTIONIST gets default password Invent123 and must reset on first login', enum: UserType })
  @IsEnum(UserType)
  @IsOptional()
  role?: UserType;
}
