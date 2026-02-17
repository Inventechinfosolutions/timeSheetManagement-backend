import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}

