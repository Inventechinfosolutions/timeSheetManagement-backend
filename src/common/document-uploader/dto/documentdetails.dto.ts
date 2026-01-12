import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class DocumentDetailsDto {
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => value?.trim())
  key: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => value?.trim())
  entityType: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  entityId: number;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => value?.trim())
  refType: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  refId: number;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  createdAt: string | number | Date;
}
