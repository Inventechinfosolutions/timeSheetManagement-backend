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

  constructor(private readonly managerMappingService: ManagerMappingService) {}

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
        if (normalized === 'ACTIVE' || normalized === 'INACTIVE') {
          statusEnum = ManagerMappingStatus[normalized as keyof typeof ManagerMappingStatus];
        } else {
          throw new HttpException('Invalid status value. Allowed: ACTIVE, INACTIVE', HttpStatus.BAD_REQUEST);
        }
      }

      return await this.managerMappingService.findAll(options, validSortOrder, search, statusEnum, managerName);
    } catch (error) {
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
  async getHistory(): Promise<any[]> {
    return await this.managerMappingService.getMappingHistory();
  }

  @Get('/mapped-employee-ids')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get all active mapped employee IDs' })
  @ApiResponse({ status: 200, description: 'Get list of employee IDs' })
  async getMappedEmployeeIds(): Promise<string[]> {
    return await this.managerMappingService.getMappedEmployeeIds();
  }

  @Get('/:id')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Fetched Successfully' })
  @ApiNotFoundResponse({ description: 'Not found Request' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @ApiResponse({ status: 200, description: 'Get manager mapping by id' })
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<ManagerMappingDTO> {
    try {
      return await this.managerMappingService.findOne(id);
    } catch (error) {
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
      return await this.managerMappingService.create(dto);
    } catch (error) {
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
      return await this.managerMappingService.update(id, dto);
    } catch (error) {
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
    const userContext = req.user;
    const loginId = userContext?.userId || 'unknown';

    const updated = await this.managerMappingService.partialUpdate(id, updateData, loginId);

    return {
      message: 'Manager mapping partially updated successfully',
      data: updated,
    };
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
      await this.managerMappingService.delete(id);
      return { message: `ManagerMapping with id ${id} deactivated successfully` };
    } catch (error) {
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
      return await this.managerMappingService.findByEmployeeId(employeeId);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }
}
