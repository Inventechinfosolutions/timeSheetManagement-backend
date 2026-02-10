import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { UsersService } from '../../users/service/user.service';
import { EmployeeLinkService } from './employeeLink.service';
import { UserLoginDto } from '../../users/dto/user-login.dto';
import { ResetPasswordDto } from '../dto/resetPassword.dto';

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly employeeLinkService: EmployeeLinkService,
  ) {}

  async login(userLoginDto: UserLoginDto) {
    const METHOD = 'login';
    this.logger.log(`[${METHOD}] Public login attempt for: ${userLoginDto.loginId}`);
    try {
      return await this.usersService.login(userLoginDto);
    } catch (error) {
      this.logger.error(`[${METHOD}] Login failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async verifyAndActivateEmployee(token: string) {
    const METHOD = 'verifyAndActivateEmployee';
    this.logger.log(`[${METHOD}] Verifying employee activation...`);
    try {
      return await this.employeeLinkService.verifyAndActivateEmployee(token);
    } catch (error) {
      this.logger.error(`[${METHOD}] Activation failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async resetPasswordEmployee(resetPasswordDto: ResetPasswordDto) {
    const METHOD = 'resetPasswordEmployee';
    this.logger.log(`[${METHOD}] Resetting employee password for: ${resetPasswordDto.token ? 'Token-based' : resetPasswordDto.loginId}`);
    try {
      return await this.employeeLinkService.resetPasswordWithToken(resetPasswordDto);
    } catch (error) {
      this.logger.error(`[${METHOD}] Password reset failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
