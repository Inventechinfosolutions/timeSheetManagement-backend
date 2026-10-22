import { IsOptional, IsBoolean, IsString, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InboxFolder } from '../enums/note-permission.enum';

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

  @ApiPropertyOptional({
    description: 'Folder filter: INBOX (received) or SENT (sent by user)',
    enum: InboxFolder,
    default: InboxFolder.INBOX,
  })
  @IsOptional()
  @IsEnum(InboxFolder)
  folder?: InboxFolder;

  @ApiPropertyOptional({ description: 'Page number for pagination (starts at 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page (default: 5)', default: 5 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ description: 'Alias for limit (items per page, default: 5)', default: 5 })
  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}

