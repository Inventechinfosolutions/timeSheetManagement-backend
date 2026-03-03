import { Injectable, NotFoundException, ConflictException, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MasterDepartment } from '../models/master-department.entity';
import { CreateDepartmentDto } from '../dto/create-department.dto';
import { UpdateDepartmentDto } from '../dto/update-department.dto';

@Injectable()
export class MasterDepartmentService {
  private readonly logger = new Logger(MasterDepartmentService.name);

  constructor(
    @InjectRepository(MasterDepartment)
    private readonly departmentRepository: Repository<MasterDepartment>,
  ) { }

  async create(createDepartmentDto: CreateDepartmentDto): Promise<MasterDepartment> {
    this.logger.log(`Starting creation of new department: ${createDepartmentDto.departmentName} (${createDepartmentDto.departmentCode})`);
    try {
      const existing = await this.departmentRepository.findOne({
        where: { departmentCode: createDepartmentDto.departmentCode },
      });
      if (existing) {
        this.logger.warn(`Failed to create department: Code ${createDepartmentDto.departmentCode} already exists`);
        throw new ConflictException(`Department with code ${createDepartmentDto.departmentCode} already exists`);
      }

      const department = this.departmentRepository.create(createDepartmentDto);
      const saved = await this.departmentRepository.save(department);
      this.logger.log(`Successfully created department ID: ${saved.id}`);
      return saved;
    } catch (error) {
      this.logger.error(`Error creating department: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to create department: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findAll(): Promise<MasterDepartment[]> {
    this.logger.log('Fetching all departments');
    try {
      const departments = await this.departmentRepository.find();
      this.logger.log(`Retrieved ${departments.length} departments`);
      return departments;
    } catch (error) {
      this.logger.error(`Error fetching departments: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch departments: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findOne(id: number): Promise<MasterDepartment> {
    this.logger.log(`Fetching department with ID: ${id}`);
    try {
      const department = await this.departmentRepository.findOne({ where: { id } });
      if (!department) {
        this.logger.warn(`Department fetch failed: ID ${id} not found`);
        throw new NotFoundException(`Department with ID ${id} not found`);
      }
      return department;
    } catch (error) {
      this.logger.error(`Error fetching department ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch department: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async update(id: number, updateDepartmentDto: UpdateDepartmentDto): Promise<MasterDepartment> {
    this.logger.log(`Starting update for department ID: ${id}`);
    try {
      const department = await this.findOne(id);

      if (updateDepartmentDto.departmentCode && updateDepartmentDto.departmentCode !== department.departmentCode) {
        const existing = await this.departmentRepository.findOne({
          where: { departmentCode: updateDepartmentDto.departmentCode },
        });
        if (existing) {
          this.logger.warn(`Failed to update department ${id}: Code ${updateDepartmentDto.departmentCode} already exists`);
          throw new ConflictException(`Department with code ${updateDepartmentDto.departmentCode} already exists`);
        }
      }

      Object.assign(department, updateDepartmentDto);
      const updated = await this.departmentRepository.save(department);
      this.logger.log(`Successfully updated department ID: ${id}`);
      return updated;
    } catch (error) {
      this.logger.error(`Error updating department ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to update department: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async remove(id: number): Promise<void> {
    this.logger.log(`Starting removal of department ID: ${id}`);
    try {
      const department = await this.findOne(id);
      await this.departmentRepository.remove(department);
      this.logger.log(`Successfully removed department ID: ${id}`);
    } catch (error) {
      this.logger.error(`Error removing department ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to remove department: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
