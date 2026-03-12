import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Human Resources', description: 'Name of the department' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  departmentName: string;

  @ApiProperty({ example: 'HR', description: 'Unique code for the department' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  departmentCode: string;
}
