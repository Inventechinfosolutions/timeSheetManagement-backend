import { IsArray, IsNotEmpty, IsNumber, IsString, ArrayMinSize } from 'class-validator';

export class EnrollFaceDemoDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsArray()
  @ArrayMinSize(5)
  @IsString({ each: true })
  images: string[];
}

export class VerifyFaceDemoDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  embedding: number[];

  @IsArray()
  @ArrayMinSize(3)
  @IsString({ each: true })
  images: string[];
}
