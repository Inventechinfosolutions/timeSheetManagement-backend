import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Gender } from '../enums/gender.enum';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCeoDto {
  @ApiProperty({ description: 'Full Name of the CEO', example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  fullName: string;

  @ApiProperty({ description: 'Registered Email of the CEO', example: 'ceo@worksphere.com' })
  @IsEmail({}, { message: 'A valid email address is required' })
  @IsNotEmpty({ message: 'Email is required' })
  @MaxLength(255)
  @Transform(({ value }) => value?.trim().toLowerCase())
  email: string;

  @ApiProperty({ description: 'Designation of the CEO', example: 'Chief Executive Officer' })
  @IsString()
  @IsNotEmpty({ message: 'Designation is required' })
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  designation: string;

  @ApiProperty({ description: 'Gender of the CEO', enum: Gender, example: Gender.FEMALE })
  @IsEnum(Gender, { message: 'Gender must be a valid gender value' })
  @IsNotEmpty({ message: 'Gender is required' })
  gender: Gender;

  @ApiProperty({ description: 'Initial password for CEO login', example: 'SecureCeo@2026' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @MaxLength(100)
  password: string;
}
