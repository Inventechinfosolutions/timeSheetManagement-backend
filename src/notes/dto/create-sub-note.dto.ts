import { IsNotEmpty, IsOptional, IsString, IsNumber } from 'class-validator';

export class CreateSubNoteDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  orderIndex?: number;

  @IsOptional()
  @IsString()
  color?: string;
}

