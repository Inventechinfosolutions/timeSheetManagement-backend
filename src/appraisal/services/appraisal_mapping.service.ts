import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AppraisalAssignerType,
  AppraisalMapping,
  AppraisalMappingStatus,
} from '../entities/appraisal_mapping.entity';
import {
  AppraisalAssignerListItemDto,
  AppraisalMappingResponseDto,
  CreateAppraisalMappingDto,
} from '../dto/appraisal_mapping.dto';

@Injectable()
export class AppraisalMappingService {
  private readonly logger = new Logger(AppraisalMappingService.name);

  constructor(
    @InjectRepository(AppraisalMapping)
    private readonly mappingRepo: Repository<AppraisalMapping>,
  ) {}

  private toDto(entity: AppraisalMapping): AppraisalMappingResponseDto {
    return {
      id: entity.id,
      department: entity.department,
      assignerId: entity.assignerId,
      assignerName: entity.assignerName,
      assignerType: entity.assignerType,
      employeeId: entity.employeeId,
      employeeName: entity.employeeName,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /** Active mapping for an employee, if any. Null = keep old manager-only appraisal flow. */
  async findActiveByEmployeeId(employeeId: string): Promise<AppraisalMapping | null> {
    const id = employeeId?.trim();
    if (!id) return null;
    return this.mappingRepo.findOne({
      where: { employeeId: id, status: AppraisalMappingStatus.ACTIVE },
    });
  }

  private applyListFilters(
    qb: ReturnType<Repository<AppraisalMapping>['createQueryBuilder']>,
    query: {
      search?: string;
      department?: string;
      assignerId?: string;
      status?: string;
    },
  ) {
    if (query.status) {
      qb.andWhere('m.status = :status', { status: query.status });
    } else {
      qb.andWhere('m.status = :status', { status: AppraisalMappingStatus.ACTIVE });
    }
    if (query.department) {
      qb.andWhere('m.department = :department', { department: query.department });
    }
    if (query.assignerId) {
      qb.andWhere('m.assigner_id = :assignerId', { assignerId: query.assignerId });
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(m.employee_id) LIKE :term OR LOWER(m.employee_name) LIKE :term OR LOWER(m.assigner_name) LIKE :term OR LOWER(COALESCE(m.department, '')) LIKE :term)`,
        { term },
      );
    }
  }

  /** Build one history row per assigner+department with mapped count + employee ids. */
  private async buildAssignerListItems(
    query: {
      search?: string;
      department?: string;
      assignerId?: string;
      status?: string;
    },
    groups: Array<{ assignerId: string; department: string | null }>,
  ): Promise<AppraisalAssignerListItemDto[]> {
    if (!groups.length) return [];

    const rowsQb = this.mappingRepo.createQueryBuilder('m');
    this.applyListFilters(rowsQb, query);
    rowsQb.andWhere(
      groups
        .map((_, i) => {
          const dept = groups[i].department;
          if (dept == null || dept === '') {
            return `(m.assigner_id = :aid${i} AND (m.department IS NULL OR m.department = ''))`;
          }
          return `(m.assigner_id = :aid${i} AND m.department = :dept${i})`;
        })
        .join(' OR '),
      Object.fromEntries(
        groups.flatMap((g, i) => {
          const entries: [string, string][] = [[`aid${i}`, g.assignerId]];
          if (g.department != null && g.department !== '') {
            entries.push([`dept${i}`, g.department]);
          }
          return entries;
        }),
      ),
    );
    rowsQb.orderBy('m.createdAt', 'DESC');
    const rows = await rowsQb.getMany();

    const byKey = new Map<string, AppraisalAssignerListItemDto>();
    for (const row of rows) {
      const key = `${row.assignerId}::${row.department || ''}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.mappedCount += 1;
        if (!existing.mappedEmployeeIds.includes(row.employeeId)) {
          existing.mappedEmployeeIds.push(row.employeeId);
        }
      } else {
        byKey.set(key, {
          department: row.department,
          assignerId: row.assignerId,
          assignerName: row.assignerName,
          assignerType: row.assignerType,
          status: row.status,
          mappedCount: 1,
          mappedEmployeeIds: [row.employeeId],
        });
      }
    }

    // Preserve group order from pagination query
    return groups
      .map((g) => byKey.get(`${g.assignerId}::${g.department || ''}`))
      .filter((item): item is AppraisalAssignerListItemDto => Boolean(item));
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    department?: string;
    assignerId?: string;
    status?: string;
    paginate?: boolean;
  }): Promise<{
    items: AppraisalAssignerListItemDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;

    const countQb = this.mappingRepo
      .createQueryBuilder('m')
      .select(
        `COUNT(DISTINCT CONCAT(m.assigner_id, '::', COALESCE(m.department, '')))`,
        'cnt',
      );
    this.applyListFilters(countQb, query);
    const total = Number((await countQb.getRawOne())?.cnt || 0);

    const groupsQb = this.mappingRepo
      .createQueryBuilder('m')
      .select('m.assigner_id', 'assignerId')
      .addSelect('m.department', 'department')
      .addSelect('MAX(m.createdAt)', 'latest');
    this.applyListFilters(groupsQb, query);
    groupsQb
      .groupBy('m.assigner_id')
      .addGroupBy('m.department')
      .orderBy('latest', 'DESC');

    if (query.paginate !== false) {
      groupsQb.offset((page - 1) * limit).limit(limit);
    }

    const groups = await groupsQb.getRawMany<{
      assignerId: string;
      department: string | null;
      latest: Date;
    }>();

    const items = await this.buildAssignerListItems(query, groups);

    return {
      items,
      total,
      page: query.paginate === false ? 1 : page,
      limit: query.paginate === false ? total : limit,
    };
  }

  async getMappedEmployeeIds(): Promise<string[]> {
    const rows = await this.mappingRepo.find({
      where: { status: AppraisalMappingStatus.ACTIVE },
      select: ['employeeId'],
    });
    return rows.map((r) => r.employeeId);
  }

  async create(dto: CreateAppraisalMappingDto): Promise<AppraisalMappingResponseDto> {
    const employeeId = dto.employeeId.trim();
    const existing = await this.mappingRepo.findOne({
      where: { employeeId, status: AppraisalMappingStatus.ACTIVE },
    });
    if (existing) {
      throw new BadRequestException(
        `Employee ${employeeId} is already mapped to assigner ${existing.assignerName}`,
      );
    }

    const entity = this.mappingRepo.create({
      department: dto.department?.trim() || null,
      assignerId: dto.assignerId.trim(),
      assignerName: dto.assignerName.trim(),
      assignerType: dto.assignerType,
      employeeId,
      employeeName: dto.employeeName.trim(),
      status: dto.status || AppraisalMappingStatus.ACTIVE,
    });
    const saved = await this.mappingRepo.save(entity);
    this.logger.log(`Appraisal mapping created id=${saved.id} employee=${employeeId}`);
    return this.toDto(saved);
  }

  async createBulk(items: CreateAppraisalMappingDto[]): Promise<AppraisalMappingResponseDto[]> {
    if (!items?.length) {
      throw new BadRequestException('No mapping items provided');
    }
    const results: AppraisalMappingResponseDto[] = [];
    for (const item of items) {
      results.push(await this.create(item));
    }
    return results;
  }

  /** Unmap: hard-delete the row (do not soft-set INACTIVE). */
  async deactivate(id: number): Promise<AppraisalMappingResponseDto> {
    const entity = await this.mappingRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Appraisal mapping ${id} not found`);
    }
    const dto = this.toDto(entity);
    await this.mappingRepo.remove(entity);
    this.logger.log(`Appraisal mapping deleted id=${id} employee=${dto.employeeId}`);
    return dto;
  }

  async findByAssigner(
    assignerId: string,
    options?: { department?: string; status?: string },
  ): Promise<AppraisalMappingResponseDto[]> {
    const qb = this.mappingRepo
      .createQueryBuilder('m')
      .where('m.assigner_id = :assignerId', { assignerId: assignerId.trim() });

    const status = options?.status?.trim() || AppraisalMappingStatus.ACTIVE;
    qb.andWhere('m.status = :status', { status });

    if (options?.department?.trim()) {
      qb.andWhere('m.department = :department', {
        department: options.department.trim(),
      });
    }

    qb.orderBy('m.createdAt', 'DESC');
    const rows = await qb.getMany();
    return rows.map((e) => this.toDto(e));
  }

  resolveAssignerTypeFromRole(role?: string | null): AppraisalAssignerType {
    const normalized = String(role || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
    if (normalized === 'MANAGER' || normalized === 'GENERAL_MANAGER' || normalized === 'CEO') {
      return AppraisalAssignerType.MANAGER;
    }
    return AppraisalAssignerType.EMPLOYEE;
  }

  async findActiveByEmployeeIds(employeeIds: string[]): Promise<AppraisalMapping[]> {
    const ids = employeeIds.map((id) => id.trim()).filter(Boolean);
    if (!ids.length) return [];
    return this.mappingRepo.find({
      where: { employeeId: In(ids), status: AppraisalMappingStatus.ACTIVE },
    });
  }
}
