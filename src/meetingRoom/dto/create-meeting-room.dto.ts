import { IsNotEmpty, IsNumber, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMeetingRoomDto {
  @IsString()
  @IsNotEmpty({ message: 'Floor number is required' })
  @MaxLength(50)
  floorNumber: string;

  @IsString()
  @IsNotEmpty({ message: 'Meeting room number is required' })
  @MaxLength(100)
  roomNumber: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Dimension must be a valid number in sq ft' })
  @Min(1, { message: 'Dimension must be greater than 0 sq ft' })
  dimensionSqFt: number;
}
