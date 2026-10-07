import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RevealRatingDto {
  @ApiProperty({ description: 'Login password checked against the users table. It is not stored.' })
  @IsNotEmpty()
  @IsString()
  password: string;
}
