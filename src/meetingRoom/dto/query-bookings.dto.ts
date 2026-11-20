import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryBookingsDto {
  @IsOptional()
  @IsString()
  @IsIn(['all', 'department'])
  scope?: 'all' | 'department';

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
