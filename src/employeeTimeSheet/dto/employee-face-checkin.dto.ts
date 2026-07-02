import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDate, IsNotEmpty, IsString } from 'class-validator';

export class CheckinDto {
  @ApiProperty({ description: 'Employee string ID' })
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @ApiProperty({ description: 'Check-in timestamp' })
  @IsDate()
  @Type(() => Date)
  @IsNotEmpty()
  checkingInTime: Date;

  @ApiProperty({
    description: 'Base64 or data-URL face images (at least 3 required)',
    type: [String],
    minItems: 3,
  })
  @IsArray()
  @ArrayMinSize(3)
  @IsString({ each: true })
  images: string[];
}
