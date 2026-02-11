import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MasterDepartment } from '../models/master-department.entity';
import { CreateDepartmentDto } from '../dto/create-department.dto';
import { UpdateDepartmentDto } from '../dto/update-department.dto';

@Injectable()
export class MasterDepartmentService {
  constructor(
    @InjectRepository(MasterDepartment)
    private readonly departmentRepository: Repository<MasterDepartment>,
  ) {}

  async create(createDepartmentDto: CreateDepartmentDto): Promise<MasterDepartment> {
    const existing = await this.departmentRepository.findOne({
      where: { departmentCode: createDepartmentDto.departmentCode },
    });
    if (existing) {
      throw new ConflictException(`Department with code ${createDepartmentDto.departmentCode} already exists`);
    }

    const department = this.departmentRepository.create(createDepartmentDto);
    return await this.departmentRepository.save(department);
  }

  async findAll(): Promise<MasterDepartment[]> {
    return await this.departmentRepository.find();
  }

  async findOne(id: number): Promise<MasterDepartment> {
    const department = await this.departmentRepository.findOne({ where: { id } });
    if (!department) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }
    return department;
  }

  async update(id: number, updateDepartmentDto: UpdateDepartmentDto): Promise<MasterDepartment> {
    const department = await this.findOne(id);
    
    if (updateDepartmentDto.departmentCode && updateDepartmentDto.departmentCode !== department.departmentCode) {
      const existing = await this.departmentRepository.findOne({
        where: { departmentCode: updateDepartmentDto.departmentCode },
      });
      if (existing) {
        throw new ConflictException(`Department with code ${updateDepartmentDto.departmentCode} already exists`);
      }
    }

    Object.assign(department, updateDepartmentDto);
    return await this.departmentRepository.save(department);
  }

  async remove(id: number): Promise<void> {
    const department = await this.findOne(id);
    await this.departmentRepository.remove(department);
  }
}
