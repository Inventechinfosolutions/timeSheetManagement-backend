import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class EnrollFaceDto {
  @ApiProperty({ description: 'Employee string ID' })
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @ApiProperty({
    description: 'Base64 or data-URL face pose images (exactly 5 required)',
    type: [String],
    minItems: 5,
  })
  @IsArray()
  @ArrayMinSize(5)
  @IsString({ each: true })
  images: string[];
}
