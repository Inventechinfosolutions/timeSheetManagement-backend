import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  photoUrl?: string;

  @IsArray()
  @IsOptional()
  files?: Array<{
    name: string;
    url: string;
    size: number;
    type: string;
  }>;
}