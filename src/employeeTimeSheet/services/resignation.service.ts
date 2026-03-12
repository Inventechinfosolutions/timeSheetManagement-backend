import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resignation } from '../entities/resignation.entity';
import { ResignationStatus } from '../enums/resignation-status.enum';
import { CreateResignationDto } from '../dto/resignation.dto';
import { UpdateResignationStatusDto } from '../dto/resignation.dto';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { UserType } from '../../users/enums/user-type.enum';
import { ManagerMapping, ManagerMappingStatus } from '../../managerMapping/entities/managerMapping.entity';

@Injectable()
export class ResignationService {
  private readonly logger = new Logger(ResignationService.name);

  constructor(
    @InjectRepository(Resignation)
    private readonly resignationRepository: Repository<Resignation>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepository: Repository<ManagerMapping>,
  ) {}

  async create(dto: CreateResignationDto): Promise<Resignation> {
    this.logger.log(`[CREATE] Resignation for employee: ${dto.employeeId}`);
    const resignation = this.resignationRepository.create({
      employeeId: dto.employeeId,
      submittedDate: dto.submittedDate,
      proposedLastWorkingDate: dto.proposedLastWorkingDate,
      reason: dto.reason.trim(),
      status: ResignationStatus.PENDING,
    });
    return await this.resignationRepository.save(resignation);
  }

  async findAll(filters: {
    employeeId?: string;
    department?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    managerName?: string;
    managerId?: string;
  }): Promise<{ data: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const { employeeId, department, status, search, page = 1, limit = 10, managerName, managerId } = filters;
    this.logger.log(`[FETCH] Resignations - employeeId=${employeeId}, status=${status}, page=${page}`);

    const qb = this.resignationRepository
      .createQueryBuilder('r')
      .leftJoin(EmployeeDetails, 'ed', 'ed.employeeId = r.employeeId')
      .select([
        'r.id AS id',
        'r.employeeId AS employeeId',
        'r.submittedDate AS submittedDate',
        'r.proposedLastWorkingDate AS proposedLastWorkingDate',
        'r.reason AS reason',
        'r.status AS status',
        'r.reviewedBy AS reviewedBy',
        'r.reviewedAt AS reviewedAt',
        'r.comments AS comments',
        'r.createdAt AS createdAt',
        'r.updatedAt AS updatedAt',
        'ed.fullName AS fullName',
        'ed.department AS department',
        'ed.designation AS designation',
      ]);

    if (employeeId) {
      qb.andWhere('r.employeeId = :employeeId', { employeeId });
    }
    if (department && department !== 'All') {
      qb.andWhere('ed.department = :department', { department });
    }
    if (status && status !== 'All') {
      qb.andWhere('r.status = :status', { status });
    }
    if (search && search.trim() !== '') {
      const pattern = `%${search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(ed.fullName) LIKE :pattern OR LOWER(r.employeeId) LIKE :pattern OR LOWER(r.reason) LIKE :pattern)',
        { pattern },
      );
    }
    if (managerName || managerId) {
      qb.leftJoin(ManagerMapping, 'mm', 'mm.employeeId = r.employeeId AND mm.status = :mmStatus', {
        mmStatus: ManagerMappingStatus.ACTIVE,
      });
      qb.andWhere(
        '(mm.managerName = :managerName OR mm.managerName = :managerIdOrName OR r.employeeId = :exactManagerId)',
        {
          managerName: managerName || '',
          managerIdOrName: managerId || managerName || '',
          exactManagerId: managerId || '',
        },
      );
    }

    const total = await qb.getCount();
    const data = await qb
      .orderBy('r.updatedAt', 'DESC')
      .addOrderBy('r.createdAt', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    return {
      data,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByEmployeeId(employeeId: string, status?: string, page = 1, limit = 10) {
    return this.findAll({ employeeId, status, page, limit });
  }

  async findOne(id: number): Promise<any> {
    const result = await this.resignationRepository
      .createQueryBuilder('r')
      .leftJoin(EmployeeDetails, 'ed', 'ed.employeeId = r.employeeId')
      .where('r.id = :id', { id })
      .select([
        'r.id AS id',
        'r.employeeId AS employeeId',
        'r.submittedDate AS submittedDate',
        'r.proposedLastWorkingDate AS proposedLastWorkingDate',
        'r.reason AS reason',
        'r.status AS status',
        'r.reviewedBy AS reviewedBy',
        'r.reviewedAt AS reviewedAt',
        'r.comments AS comments',
        'r.createdAt AS createdAt',
        'r.updatedAt AS updatedAt',
        'ed.fullName AS fullName',
        'ed.department AS department',
        'ed.designation AS designation',
        'ed.email AS email',
      ])
      .getRawOne();

    if (!result) {
      throw new NotFoundException(`Resignation with ID ${id} not found`);
    }
    return result;
  }

  async updateStatus(id: number, dto: UpdateResignationStatusDto, reviewerName?: string): Promise<Resignation> {
    const resignation = await this.resignationRepository.findOne({ where: { id } });
    if (!resignation) {
      throw new NotFoundException(`Resignation with ID ${id} not found`);
    }
    if (resignation.status !== ResignationStatus.PENDING) {
      throw new ForbiddenException(`Only PENDING resignations can be updated. Current status: ${resignation.status}`);
    }
    resignation.status = dto.status;
    resignation.reviewedBy = reviewerName || null;
    resignation.reviewedAt = new Date();
    resignation.comments = dto.comments ?? resignation.comments;
    return await this.resignationRepository.save(resignation);
  }

  async withdraw(id: number, employeeId: string): Promise<Resignation> {
    const resignation = await this.resignationRepository.findOne({ where: { id } });
    if (!resignation) {
      throw new NotFoundException(`Resignation with ID ${id} not found`);
    }
    if (resignation.employeeId !== employeeId) {
      throw new ForbiddenException('Only the applicant can withdraw this resignation');
    }
    if (resignation.status !== ResignationStatus.PENDING) {
      throw new ForbiddenException(`Only PENDING resignations can be withdrawn. Current status: ${resignation.status}`);
    }
    resignation.status = ResignationStatus.WITHDRAWN;
    return await this.resignationRepository.save(resignation);
  }
}
