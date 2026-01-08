import { 
  Controller, 
  Post, 
  Param, 
  ParseIntPipe, 
  Logger, 
  HttpException, 
  HttpStatus,
  UseGuards,
  Body,
  Req
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiParam, 
  ApiOkResponse, 
  ApiNotFoundResponse, 
  ApiInternalServerErrorResponse,
  ApiBearerAuth,
  ApiBody,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse
} from '@nestjs/swagger';
import { EmployeeLinkService } from '../services/employeeLink.service';
// import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'; 

@ApiTags('Employee Link Management')
@Controller('employee-link')
@ApiBearerAuth()
// @UseGuards(JwtAuthGuard)
export class EmployeeLinkController {
  private readonly logger = new Logger(EmployeeLinkController.name);

  constructor(private readonly employeeLinkService: EmployeeLinkService) {}

  @Post('/generate-email-activation/:id')
  @ApiOperation({ 
    summary: 'Generate activation link and unique password',
    description: 'Generates a unique password for the employee, updates the record, and simulates sending an email with the link and credentials for the given employee ID.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'Employee Primary ID' })
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
  async generateEmailActivationLink(@Param('id', ParseIntPipe) id: number) {
    try {
      this.logger.log(`Request to generate activation link for employee ID: ${id}`);
      return await this.employeeLinkService.generateActivationLink(id);
    } catch (error) {
       this.logger.error(`Error in controller: ${error.message}`, error.stack);
       throw error;
    }
  }
}
