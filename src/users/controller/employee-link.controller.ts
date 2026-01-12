import { 
  Controller, 
  Post, 
  Param, 
  Logger, 
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiParam, 
  ApiOkResponse, 
  ApiNotFoundResponse, 
  ApiInternalServerErrorResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { EmployeeLinkService } from '../service/employee-link.service';

@ApiTags('Employee Link Management')
@Controller('employee-link')
@ApiBearerAuth()
export class EmployeeLinkController {
  private readonly logger = new Logger(EmployeeLinkController.name);

  constructor(private readonly employeeLinkService: EmployeeLinkService) {}

  @Post('/generate-email-activation/:employeeId')
  @ApiOperation({ 
    summary: 'Generate activation link and unique password',
    description: 'Generates a unique password for the employee, updates the record, and simulates sending an email with the link and credentials for the given employee ID string.'
  })
  @ApiParam({ name: 'employeeId', type: 'string', description: 'Employee ID (the unique string identifier)' })
  @ApiOkResponse({ 
    description: 'Activation link and credentials generated successfully',
    schema: {
        type: 'object',
        properties: {
            message: { type: 'string' },
            employeeId: { type: 'string' },
            password: { type: 'string' },
            activationLink: { type: 'string' }
        }
    }
  })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async generateEmailActivationLink(@Param('employeeId') employeeId: string) {
    try {
      this.logger.log(`Request to generate activation link for employee: ${employeeId}`);
      return await this.employeeLinkService.generateActivationLink(employeeId);
    } catch (error) {
       this.logger.error(`Error in controller: ${error.message}`, error.stack);
       throw error;
    }
  }
}
