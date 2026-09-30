import { IsOptional, IsBoolean, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryInboxDto {
  @ApiPropertyOptional({ description: 'Filter by read status (true/false)' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({ description: 'Search term for sender or note title/content' })
  @IsOptional()
  @IsString()
  search?: string;
}
