/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpException,
  HttpStatus,
  HttpCode,
  UseGuards,
  Query,
  Req,
  ParseIntPipe,
  Patch,
  Logger,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';

import { ManagerMappingDTO } from '../dto/managerMapping.dto';
import { ManagerMappingStatus } from '../entities/managerMapping.entity';
import { ManagerMappingService } from '../services/managerMapping.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@ApiTags('Manager Mapping')
@Controller('/manager-mapping')
// @UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ManagerMappingController {
  private readonly logger = new Logger(ManagerMappingController.name);

  constructor(private readonly managerMappingService: ManagerMappingService) { }

  @Get('/all')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Fetched Successfully' })
  @ApiCreatedResponse({ description: 'Created Successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Unauthorized Request' })
  @ApiUnprocessableEntityResponse({ description: 'Bad Request' })
  @ApiNotFoundResponse({ description: 'Not found Request' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @ApiBadRequestResponse({ description: 'Mandatory Fields are missing' })
  @ApiResponse({
    status: 200,
    description: 'Get all manager mappings with pagination and search',
  })
  @ApiOperation({
    summary: 'Get all manager mappings with pagination and search',
    description:
      'Retrieve all manager mappings with optional pagination and search. Query parameters: page (default: 1), limit (default: 10), sortOrder (ASC/DESC, default: ASC), search (optional)',
  })
  @ApiQuery({ name: 'status', enum: ManagerMappingStatus, required: false })
  @ApiQuery({ name: 'managerName', type: String, required: false })
  async getAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('managerName') managerName?: string,
  ): Promise<Pagination<ManagerMappingDTO>> {
    try {
      this.logger.log(`Fetching all manager mappings - Page: ${page}, Limit: ${limit}`);
      const pageNumber = page ? parseInt(page, 10) : 1;
      const limitNumber = limit ? parseInt(limit, 10) : 10;

      // Validate page and limit are positive numbers
      if (isNaN(pageNumber) || pageNumber < 1) {
        throw new HttpException('Page must be a positive number', HttpStatus.BAD_REQUEST);
      }
      if (isNaN(limitNumber) || limitNumber < 1) {
        throw new HttpException('Limit must be a positive number', HttpStatus.BAD_REQUEST);
      }

      // Validate and set default sortOrder
      const validSortOrder = sortOrder === 'DESC' ? 'DESC' : 'ASC';

      const options: IPaginationOptions = {
        page: pageNumber,
        limit: limitNumber,
        route: '/manager-mapping/all',
      };

      // Convert status query to ManagerMappingStatus enum if provided
      let statusEnum: ManagerMappingStatus | undefined = undefined;
      if (status && status.trim()) {
        const normalized = status.trim().toUpperCase();
        if (normalized === ManagerMappingStatus.ACTIVE || normalized === ManagerMappingStatus.INACTIVE) {
          statusEnum = ManagerMappingStatus[normalized as keyof typeof ManagerMappingStatus];
        } else {
          throw new HttpException('Invalid status value. Allowed: ACTIVE, INACTIVE', HttpStatus.BAD_REQUEST);
        }
      }

      return await this.managerMappingService.findAll(options, validSortOrder, search, statusEnum, managerName);
    } catch (error) {
      this.logger.error(`Error fetching manager mappings: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('/history')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get aggregated manager mapping history' })
  @ApiResponse({ status: 200, description: 'Get history grouped by manager' })
  async getHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('department') department?: string,
    @Query('status') status?: string,
  ): Promise<any> {
    try {
      this.logger.log('Fetching manager mapping history');
      const pageNumber = page ? parseInt(page, 10) : 1;
      const limitNumber = limit ? parseInt(limit, 10) : 10;

      return await this.managerMappingService.getMappingHistory(
        pageNumber,
        limitNumber,
        search,
        sortBy,
        sortOrder,
        department,
        status
      );
    } catch (error) {
      this.logger.error(`Error fetching mapping history: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('/mapped-employee-ids')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get all active mapped employee IDs' })
  @ApiResponse({ status: 200, description: 'Get list of employee IDs' })
  async getMappedEmployeeIds(): Promise<string[]> {
    try {
      this.logger.log('Fetching all mapped employee IDs');
      return await this.managerMappingService.getMappedEmployeeIds();
    } catch (error) {
      this.logger.error(`Error fetching mapped employee IDs: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('/:id')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Fetched Successfully' })
  @ApiNotFoundResponse({ description: 'Not found Request' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @ApiResponse({ status: 200, description: 'Get manager mapping by id' })
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<ManagerMappingDTO> {
    try {
      this.logger.log(`Fetching manager mapping ID: ${id}`);
      return await this.managerMappingService.findOne(id);
    } catch (error) {
      this.logger.error(`Error fetching manager mapping ${id}: ${error.message}`, error.stack);
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  @Post('/create')
  @HttpCode(201)
  @ApiOkResponse({ description: 'Fetched Successfully' })
  @ApiCreatedResponse({ description: 'Created Successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Unauthorized Request' })
  @ApiUnprocessableEntityResponse({ description: 'Bad Request' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @ApiBadRequestResponse({ description: 'Mandatory Fields are missing' })
  @ApiResponse({ status: 201, description: 'Create new manager mapping' })
  async create(@Body() dto: ManagerMappingDTO): Promise<ManagerMappingDTO> {
    try {
      this.logger.log(`Creating manager mapping for employee: ${dto.employeeId}`);
      return await this.managerMappingService.create(dto);
    } catch (error) {
      this.logger.error(`Error creating manager mapping: ${error.message}`, error.stack);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Put(':id/update')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Updated Successfully' })
  @ApiNotFoundResponse({ description: 'Not found Request' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @ApiBadRequestResponse({ description: 'Mandatory Fields are missing' })
  @ApiOperation({ summary: 'Update manager mapping with id' })
  @ApiResponse({ status: 200, description: 'Update manager mapping by id' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: ManagerMappingDTO): Promise<ManagerMappingDTO> {
    try {
      this.logger.log(`Updating manager mapping ID: ${id}`);
      return await this.managerMappingService.update(id, dto);
    } catch (error) {
      this.logger.error(`Error updating manager mapping ${id}: ${error.message}`, error.stack);
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Partially updated successfully' })
  @ApiNotFoundResponse({ description: 'Not found Request' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @ApiOperation({ summary: 'Partially update manager mapping' })
  async patchManagerMapping(
    @Req() req: any,
    @Param('id') id: string,
    @Body() updateData: Partial<ManagerMappingDTO>,
  ): Promise<{ message: string; data: ManagerMappingDTO }> {
    try {
      this.logger.log(`Partially updating manager mapping ID: ${id}`);
      const userContext = req.user;
      const loginId = userContext?.userId || 'unknown';

      const updated = await this.managerMappingService.partialUpdate(id, updateData, loginId);

      return {
        message: 'Manager mapping partially updated successfully',
        data: updated,
      };
    } catch (error) {
      this.logger.error(`Error in partial update for ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete('/:id')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Deleted Successfully' })
  @ApiNotFoundResponse({ description: 'Not found Request' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @ApiOperation({ summary: 'Delete (deactivate) manager mapping' })
  @ApiResponse({ status: 200, description: 'Delete manager mapping by id' })
  async delete(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    try {
      this.logger.log(`Deactivating manager mapping ID: ${id}`);
      await this.managerMappingService.delete(id);
      return { message: `ManagerMapping with id ${id} deactivated successfully` };
    } catch (error) {
      this.logger.error(`Error deactivating manager mapping ${id}: ${error.message}`, error.stack);
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }


  @Get('/employee/:employeeId')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Fetched Successfully' })
  @ApiNotFoundResponse({ description: 'Not found Request' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @ApiResponse({ status: 200, description: 'Get manager mapping by employee ID' })
  async getByEmployeeId(@Param('employeeId') employeeId: string): Promise<ManagerMappingDTO | null> {
    try {
      this.logger.log(`Fetching manager mapping for employee ID: ${employeeId}`);
      return await this.managerMappingService.findByEmployeeId(employeeId);
    } catch (error) {
      this.logger.error(`Error fetching manager mapping for employee ${employeeId}: ${error.message}`, error.stack);
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }
}
