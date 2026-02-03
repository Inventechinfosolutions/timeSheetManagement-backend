import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Pagination } from 'nestjs-typeorm-paginate';
import { RolePermissionDto } from '../dto/rolePermission.dto';
import { RolePermissionService } from '../service/rolePermission.service';

@Controller('api/role-permission')
@UseInterceptors(ClassSerializerInterceptor)
@ApiBearerAuth()
@ApiTags('role-permissions')
export class RolePermissionController {
  logger = new Logger('RolePermissionController');

  constructor(private readonly rolePermissionService: RolePermissionService) {}

  @Get('/all')
  @ApiOperation({ summary: 'Get all role permissions with pagination' })
  @ApiResponse({
    status: 200,
    description: 'List all records',
    type: RolePermissionDto,
  })
  async getAll(
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<Pagination<RolePermissionDto>> {
    try {
      this.logger.log('Fetching all role permissions with pagination');

      if (page < 0) {
        throw new HttpException('Page number cannot be negative', HttpStatus.BAD_REQUEST);
      }

      const options = {
        page: page + 1, // Convert to 1-based for paginate()
        limit: Math.min(limit, 100), // Cap the limit at 100
      };

      const result = await this.rolePermissionService.findAndCount(options);

      if (result.items.length === 0) {
        this.logger.warn('No role permissions found');
        throw new HttpException('No records found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`Successfully fetched ${result.meta.totalItems} role permissions`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to fetch role permissions: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Internal server error',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get role permission by ID' })
  @ApiResponse({
    status: 200,
    description: 'The found record',
    type: RolePermissionDto,
  })
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<RolePermissionDto> {
    const result = await this.rolePermissionService.findById(id);
    if (!result) {
      throw new HttpException('Role permission not found', HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Get('/role/:roleId')
  @ApiOperation({ summary: 'Get permissions by role ID' })
  @ApiResponse({
    status: 200,
    description: 'List of permissions for the role',
    type: [RolePermissionDto],
  })
  async getByRoleId(@Param('roleId', ParseIntPipe) roleId: number): Promise<RolePermissionDto[]> {
    return await this.rolePermissionService.findByRoleId(roleId);
  }

  @Post()
  @ApiOperation({ summary: 'Create role permission' })
  @ApiResponse({
    status: 201,
    description: 'The record has been successfully created.',
    type: RolePermissionDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async post(
    @Req() req: any,
    @Res() res: Response,
    @Body() rolePermissionDTO: RolePermissionDto,
  ): Promise<void> {
    try {
      const creator = req.user?.login || 'system';
      const created = await this.rolePermissionService.save(rolePermissionDTO, creator);

      if (created) {
        res.status(201).json({
          message: 'Role permission created successfully',
          data: created,
        });
      } else {
        res.status(500).json({ message: 'Failed to create role permission' });
      }
    } catch (error) {
      this.logger.error(`Error creating role permission: ${error.message}`, error.stack);
      res.status(error.status || 500).json({
        message: error.message || 'Internal server error',
      });
    }
  }

  @Put('/:id')
  @ApiOperation({ summary: 'Update role permission with id' })
  @ApiResponse({
    status: 200,
    description: 'The record has been successfully updated.',
    type: RolePermissionDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Duplicate entry or validation error.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error.',
  })
  async putId(
    @Req() req: any,
    @Res() res: Response,
    @Param('id', ParseIntPipe) id: number,
    @Body() rolePermissionDTO: RolePermissionDto,
  ): Promise<void> {
    try {
      const updater = req.user?.login || 'system';
      const updatePermission = await this.rolePermissionService.update(rolePermissionDTO, updater, id);
      res.status(200).json({
        message: 'Role permission updated successfully',
        data: updatePermission,
      });
    } catch (error) {
      this.logger.error(`Error occurred during role permission update: ${error.stack}`);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
        statusCode: error.status || 500,
      });
    }
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete role permission' })
  @ApiResponse({
    status: 200,
    description: 'The record has been successfully deleted.',
  })
  @ApiResponse({
    status: 404,
    description: 'Record not found.',
  })
  async deleteById(
    @Req() req: any,
    @Res() res: Response,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    try {
      await this.rolePermissionService.deleteById(id);
      res.status(200).json({ message: 'Role permission deleted successfully' });
    } catch (error) {
      this.logger.error(`Failed to delete role permission with ID ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        res.status(HttpStatus.NOT_FOUND).json({ message: 'Record not found' });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
      }
    }
  }
}
