import {
  IsString,
  IsNotEmpty,
  IsInt,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateModelDto {
  @ApiProperty({ description: 'Name of the model', example: 'User Authentication Module' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  modelName: string;

  @ApiProperty({ description: 'Project ID', example: 1 })
  @IsInt()
  @IsNotEmpty()
  projectId: number;
}
