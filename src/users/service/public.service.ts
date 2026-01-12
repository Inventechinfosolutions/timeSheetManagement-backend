import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { UsersService } from './user.service';
// import { EmployeeLinkService } from './employee-link.service';
import { UserLoginDto } from '../dto/user-login.dto';
import { ResetPasswordDto } from '../../employeeTimeSheet/dto/resetPassword.dto';
import { EmployeeLinkService } from './employee-link.service';

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly employeeLinkService: EmployeeLinkService,
  ) {}

  async login(userLoginDto: UserLoginDto) {
    try {
      this.logger.log(`Public login attempt for: ${userLoginDto.loginId}`);
      return await this.usersService.login(userLoginDto);
    } catch (error) {
      this.logger.error(`Login failed in PublicService: ${error.message}`);
      throw error;
    }
  }

  async verifyAndActivateEmployee(token: string) {
    try {
      this.logger.log(`Verifying employee activation via PublicService`);
      return await this.employeeLinkService.verifyAndActivateEmployee(token);
    } catch (error) {
      this.logger.error(`Activation failed in PublicService: ${error.message}`);
      throw error;
    }
  }

  async resetPasswordEmployee(resetPasswordDto: ResetPasswordDto) {
    try {
      this.logger.log(`Resetting employee password via PublicService`);
      return await this.employeeLinkService.resetPasswordWithToken(resetPasswordDto);
    } catch (error) {
      this.logger.error(`Password reset failed in PublicService: ${error.message}`);
      throw error;
    }
  }
}
