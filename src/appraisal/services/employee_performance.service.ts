import {
  Injectable,
  NotFoundException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EmployeePerformance } from '../entities/employee_performance.entity';
import {
  CreateEmployeePerformanceDto,
  QueryEmployeePerformanceDto,
  SearchEmployeePerformanceDto,
  UpdateEmployeePerformanceDto,
} from '../dto/employee_performance.dto';
import { EmployeePerformanceStatus } from '../enums/employee_performance.enums';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';

export interface EnrichedEmployeePerformance extends EmployeePerformance {
  averageCollaborationScore?: number | null;
  employeeName?: string | null;
  department?: string | null;
}

@Injectable()
export class EmployeePerformanceService {
  private readonly logger = new Logger(EmployeePerformanceService.name);

  constructor(
    @InjectRepository(EmployeePerformance)
    private readonly performanceRepository: Repository<EmployeePerformance>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
  ) {}

  /**
   * Create a new employee performance record.
   */
  async create(createDto: CreateEmployeePerformanceDto): Promise<EnrichedEmployeePerformance> {
    try {
      this.logger.log(
        `Creating employee performance for: ${createDto.employeeId}, Quarter: ${createDto.quarter}, Project: ${createDto.projectTitle}`,
      );

      const record = this.performanceRepository.create({
        ...createDto,
        status: createDto.status || EmployeePerformanceStatus.DRAFT,
      });

      const saved = await this.performanceRepository.save(record);
      const enrichedList = await this.enrichPerformancesWithEmployeeDetails([saved]);
      return enrichedList[0];
    } catch (error) {
      this.logger.error(`Error creating employee performance: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to create performance record: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get all performance records with optional filters (getAll / getByQuery).
   */
  async findAll(query?: QueryEmployeePerformanceDto): Promise<{
    data: EnrichedEmployeePerformance[];
    total: number;
    page?: number;
    limit?: number;
  }> {
    return this.getByParams(query);
  }

  /**
   * Get performance records matching specific query parameters (getByParams).
   * Supports search by employeeId, name, department, financialYear, quarter, status, and q.
   */
  async getByParams(params?: QueryEmployeePerformanceDto): Promise<{
    data: EnrichedEmployeePerformance[];
    total: number;
    page?: number;
    limit?: number;
  }> {
    try {
      const qb = this.performanceRepository.createQueryBuilder('ep');

      // 1. Direct Employee ID filter on performance table
      if (params?.employeeId?.trim()) {
        const empId = params.employeeId.trim();
        qb.andWhere('(ep.employeeId = :exactEmpId OR ep.employeeId LIKE :likeEmpId)', {
          exactEmpId: empId,
          likeEmpId: `%${empId}%`,
        });
      }

      // 2. Employee Name or Department filter via EmployeeDetails without cross-table collation join
      if (params?.name?.trim() || params?.department?.trim()) {
        const empQb = this.employeeDetailsRepository.createQueryBuilder('emp');
        if (params.name?.trim()) {
          empQb.andWhere('emp.fullName LIKE :name', { name: `%${params.name.trim()}%` });
        }
        if (params.department?.trim()) {
          empQb.andWhere('emp.department LIKE :department', { department: `%${params.department.trim()}%` });
        }

        const matchedEmployees = await empQb.select('emp.employeeId', 'employeeId').getRawMany();
        const matchedIds = matchedEmployees.map((e) => e.employeeId).filter(Boolean);

        if (matchedIds.length === 0) {
          return {
            data: [],
            total: 0,
            page: params?.page,
            limit: params?.limit,
          };
        }
        qb.andWhere('ep.employeeId IN (:...matchedIds)', { matchedIds });
      }

      // 3. Quarter
      if (params?.quarter) {
        qb.andWhere('ep.quarter = :quarter', {
          quarter: params.quarter,
        });
      }

      // 4. Financial Year
      if (params?.financialYear?.trim()) {
        const fy = params.financialYear.trim();
        qb.andWhere('(ep.financialYear = :exactFy OR ep.financialYear LIKE :likeFy)', {
          exactFy: fy,
          likeFy: `%${fy}%`,
        });
      }

      // 5. Status
      if (params?.status) {
        qb.andWhere('ep.status = :status', {
          status: params.status,
        });
      }

      // 6. Keyword search across performance and employee records
      if (params?.q?.trim()) {
        const keyword = `%${params.q.trim()}%`;
        const empMatches = await this.employeeDetailsRepository
          .createQueryBuilder('emp')
          .where('emp.fullName LIKE :keyword OR emp.department LIKE :keyword OR emp.employeeId LIKE :keyword', {
            keyword,
          })
          .select('emp.employeeId', 'employeeId')
          .getRawMany();
        const matchedEmpIds = empMatches.map((e) => e.employeeId).filter(Boolean);

        if (matchedEmpIds.length > 0) {
          qb.andWhere(
            '(ep.employeeId IN (:...matchedEmpIds) OR ep.employeeId LIKE :keyword OR ep.projectTitle LIKE :keyword OR ep.projectDescription LIKE :keyword OR ep.overview LIKE :keyword OR ep.challenge LIKE :keyword OR ep.financialYear LIKE :keyword OR ep.quarter LIKE :keyword OR ep.status LIKE :keyword)',
            { matchedEmpIds, keyword },
          );
        } else {
          qb.andWhere(
            '(ep.employeeId LIKE :keyword OR ep.projectTitle LIKE :keyword OR ep.projectDescription LIKE :keyword OR ep.overview LIKE :keyword OR ep.challenge LIKE :keyword OR ep.financialYear LIKE :keyword OR ep.quarter LIKE :keyword OR ep.status LIKE :keyword)',
            { keyword },
          );
        }
      }

      qb.orderBy('ep.id', 'DESC');

      const total = await qb.getCount();

      if (params?.page && params?.limit) {
        const skip = (params.page - 1) * params.limit;
        qb.skip(skip).take(params.limit);
      }

      const records = await qb.getMany();
      const enriched = await this.enrichPerformancesWithEmployeeDetails(records);

      return {
        data: enriched,
        total,
        page: params?.page,
        limit: params?.limit,
      };
    } catch (error) {
      this.logger.error(`Error in getByParams performance: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch performance records: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Search performance records by keyword or filters (getBySearch).
   * Supports search by employeeId, name, department, financialYear, quarter, status, and q.
   */
  async getBySearch(searchDto: SearchEmployeePerformanceDto): Promise<{
    data: EnrichedEmployeePerformance[];
    total: number;
    page?: number;
    limit?: number;
  }> {
    return this.getByParams(searchDto);
  }

  /**
   * Find a single performance record by ID (getById).
   */
  async findOne(id: number): Promise<EnrichedEmployeePerformance> {
    const record = await this.performanceRepository.findOne({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Employee performance record with ID ${id} not found`);
    }

    let employeeName: string | null = null;
    let department: string | null = null;

    if (record.employeeId) {
      try {
        const emp = await this.employeeDetailsRepository.findOne({
          where: { employeeId: record.employeeId },
          select: ['employeeId', 'fullName', 'department'],
        });
        if (emp) {
          employeeName = emp.fullName;
          department = emp.department;
        }
      } catch (err) {
        this.logger.warn(`Could not fetch employee details for ID ${record.employeeId}: ${err.message}`);
      }
    }

    return this.enrichPerformance(record, employeeName, department);
  }

  /**
   * Update an employee performance record.
   */
  async update(
    id: number,
    updateDto: UpdateEmployeePerformanceDto,
  ): Promise<EnrichedEmployeePerformance> {
    const record = await this.performanceRepository.findOne({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Employee performance record with ID ${id} not found`);
    }

    Object.assign(record, updateDto);

    const updated = await this.performanceRepository.save(record);
    const enrichedList = await this.enrichPerformancesWithEmployeeDetails([updated]);
    return enrichedList[0];
  }

  /**
   * Delete an employee performance record by ID.
   */
  async remove(id: number): Promise<{ success: boolean; message: string }> {
    const record = await this.performanceRepository.findOne({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Employee performance record with ID ${id} not found`);
    }

    await this.performanceRepository.remove(record);
    return {
      success: true,
      message: `Employee performance record with ID ${id} deleted successfully`,
    };
  }

  /**
   * Batch enrich performance records with employee details without collation mismatch.
   */
  private async enrichPerformancesWithEmployeeDetails(
    records: EmployeePerformance[],
  ): Promise<EnrichedEmployeePerformance[]> {
    if (!records.length) return [];

    const employeeIds = Array.from(
      new Set(records.map((r) => r.employeeId).filter(Boolean)),
    );

    const employeeMap = new Map<string, { fullName: string; department: string }>();

    if (employeeIds.length > 0) {
      try {
        const employees = await this.employeeDetailsRepository.find({
          where: { employeeId: In(employeeIds) },
          select: ['employeeId', 'fullName', 'department'],
        });
        employees.forEach((emp) => {
          employeeMap.set(emp.employeeId, {
            fullName: emp.fullName,
            department: emp.department,
          });
        });
      } catch (err) {
        this.logger.warn(`Could not fetch employee details for enrichment: ${err.message}`);
      }
    }

    return records.map((r) => {
      const empInfo = employeeMap.get(r.employeeId);
      return this.enrichPerformance(
        r,
        empInfo?.fullName || null,
        empInfo?.department || null,
      );
    });
  }

  /**
   * Dynamically calculate average collaboration, teamwork metrics, and optional employee info.
   */
  private enrichPerformance(
    record: EmployeePerformance,
    employeeName?: string | null,
    department?: string | null,
  ): EnrichedEmployeePerformance {
    const scores = [
      record.crossDepartmentCollaboration,
      record.mentorshipKnowledgeSharing,
      record.reliabilityAccountability,
      record.communicationTransparency,
      record.peerSupportTeamSpirit,
      record.adaptabilityInitiative,
    ].filter((score): score is number => typeof score === 'number' && !isNaN(score));

    let averageCollaborationScore: number | null = null;
    if (scores.length > 0) {
      const sum = scores.reduce((acc, curr) => acc + curr, 0);
      averageCollaborationScore = Number((sum / scores.length).toFixed(2));
    }

    return {
      ...record,
      employeeName: employeeName ?? (record as any).employeeName ?? null,
      department: department ?? (record as any).department ?? null,
      averageCollaborationScore,
    };
  }
}

// Backward compatibility aliases
export const MasterEmployeePerformanceService = EmployeePerformanceService;
export type MasterEmployeePerformanceService = EmployeePerformanceService;
