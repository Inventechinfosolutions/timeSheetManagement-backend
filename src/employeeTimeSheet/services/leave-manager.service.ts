import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import dayjs from 'dayjs';
import { LeaveManager } from '../entities/leave-manager.entity';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { MasterDepartment } from '../../master/models/master-department.entity';
import { LeaveCalculationType } from '../../master/enums/leave-calculation-type.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { LeaveRequestType } from '../enums/leave-request-type.enum';
import { LeaveRequestStatus } from '../enums/leave-notification-status.enum';
import { AttendanceStatus } from '../enums/attendance-status.enum';
import { LeaveRequestsService } from './leave-requests.service';

export interface LeaveManagerEntryInput {
  employeeId: string;
  totalLeavesTaken: number;
}

@Injectable()
export class LeaveManagerService {
  private readonly logger = new Logger(LeaveManagerService.name);

  constructor(
    @InjectRepository(LeaveManager)
    private readonly leaveManagerRepository: Repository<LeaveManager>,
    @InjectRepository(MasterDepartment)
    private readonly departmentRepository: Repository<MasterDepartment>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    private readonly leaveRequestsService: LeaveRequestsService,
  ) {}

  async getDepartments(year: number) {
    const departments = await this.departmentRepository.find({ order: { departmentName: 'ASC' } });

    const employeeCounts: { department: string; count: string }[] = await this.employeeDetailsRepository
      .createQueryBuilder('e')
      .select('e.department', 'department')
      .addSelect('COUNT(*)', 'count')
      .where('e.userStatus = :status', { status: UserStatus.ACTIVE })
      .groupBy('e.department')
      .getRawMany();

    const entryCounts: { department: string; count: string }[] = await this.leaveManagerRepository
      .createQueryBuilder('lm')
      .innerJoin(EmployeeDetails, 'e', 'e.employeeId = lm.employeeId')
      .select('e.department', 'department')
      .addSelect('COUNT(*)', 'count')
      .where('lm.year = :year', { year })
      .andWhere('e.userStatus = :status', { status: UserStatus.ACTIVE })
      .groupBy('e.department')
      .getRawMany();

    const toMap = (rows: { department: string; count: string }[]) =>
      new Map(rows.map((r) => [String(r.department || '').toLowerCase(), Number(r.count) || 0]));
    const employeesByDept = toMap(employeeCounts);
    const entriesByDept = toMap(entryCounts);

    return departments.map((d) => {
      const key = d.departmentName.toLowerCase();
      return {
        id: d.id,
        departmentName: d.departmentName,
        departmentCode: d.departmentCode,
        leaveCalculationType: d.leaveCalculationType || LeaveCalculationType.AUTO,
        employeeCount: employeesByDept.get(key) || 0,
        manualEntriesCount: entriesByDept.get(key) || 0,
      };
    });
  }

  async updateDepartmentType(id: number, type: LeaveCalculationType, actor?: string) {
    if (type !== LeaveCalculationType.AUTO && type !== LeaveCalculationType.MANUAL) {
      throw new BadRequestException('leaveCalculationType must be AUTO or MANUAL');
    }
    const department = await this.departmentRepository.findOne({ where: { id } });
    if (!department) throw new NotFoundException(`Department ${id} not found`);

    department.leaveCalculationType = type;
    department.updatedBy = actor || department.updatedBy;
    await this.departmentRepository.save(department);
    this.logger.log(`Department ${department.departmentName} leave calculation set to ${type} by ${actor || 'unknown'}`);
    return { id: department.id, departmentName: department.departmentName, leaveCalculationType: type };
  }

  async getEmployees(departmentName: string, year: number) {
    const name = (departmentName || '').trim();
    if (!name) throw new BadRequestException('department is required');
    this.assertYear(year);

    const department = await this.departmentRepository.findOne({ where: { departmentName: name } });
    const employees = await this.employeeDetailsRepository.find({
      where: { department: name as any, userStatus: UserStatus.ACTIVE },
      select: [
        'id',
        'employeeId',
        'fullName',
        'designation',
        'department',
        'employmentType',
        'joiningDate',
        'conversionDate',
      ],
      order: { fullName: 'ASC' },
    });

    const employeeIds = employees.map((e) => e.employeeId);
    const entries = employeeIds.length
      ? await this.leaveManagerRepository.find({ where: { employeeId: In(employeeIds), year } })
      : [];
    const entryByEmployee = new Map(entries.map((e) => [e.employeeId, e]));
    const usedAfterByEmployee = await this.getApprovedLeavesAfterEntries(entries, year);

    const uptoMonth = this.accrualMonthFor(year);
    const rows = employees.map((employee) => {
      const entry = entryByEmployee.get(employee.employeeId);
      const accrued = this.leaveRequestsService.getAccruedLeaves(employee, year, uptoMonth);
      const totalLeavesTaken = entry ? Number(entry.totalLeavesTaken) : null;
      const usedAfterEntry = entry ? usedAfterByEmployee.get(employee.employeeId) || 0 : 0;
      return {
        employeeId: employee.employeeId,
        fullName: employee.fullName,
        designation: employee.designation,
        employmentType: employee.employmentType,
        isIntern: this.leaveRequestsService.isInternForMonth(employee, year, uptoMonth),
        joiningDate: employee.joiningDate ? dayjs(employee.joiningDate).format('YYYY-MM-DD') : null,
        accrued,
        totalLeavesTaken,
        usedAfterEntry,
        asOfDate: entry ? dayjs(entry.asOfDate).format('YYYY-MM-DD') : null,
        available: Math.max(0, accrued - (totalLeavesTaken ?? 0) - usedAfterEntry),
      };
    });

    return {
      department: name,
      leaveCalculationType: department?.leaveCalculationType || LeaveCalculationType.AUTO,
      year,
      accruedUptoMonth: uptoMonth,
      employees: rows,
    };
  }

  async saveEntries(year: number, entries: LeaveManagerEntryInput[], actor?: string) {
    this.assertYear(year);
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new BadRequestException('entries are required');
    }

    for (const entry of entries) {
      const value = Number(entry?.totalLeavesTaken);
      if (!entry?.employeeId || !Number.isFinite(value) || value < 0 || value > 366 || (value * 2) % 1 !== 0) {
        throw new BadRequestException(
          `Invalid total leaves for ${entry?.employeeId || 'unknown employee'}: use 0 or more in steps of 0.5`,
        );
      }
    }

    const employeeIds = [...new Set(entries.map((e) => e.employeeId))];
    const employees = await this.employeeDetailsRepository.find({
      where: { employeeId: In(employeeIds) },
      select: ['id', 'employeeId', 'department'],
    });
    const employeeById = new Map(employees.map((e) => [e.employeeId, e]));
    const missing = employeeIds.filter((id) => !employeeById.has(id));
    if (missing.length) {
      throw new BadRequestException(`Unknown employees: ${missing.join(', ')}`);
    }

    const existing = await this.leaveManagerRepository.find({ where: { employeeId: In(employeeIds), year } });
    const existingById = new Map(existing.map((e) => [e.employeeId, e]));
    const asOfDate = year === dayjs().year() ? dayjs().format('YYYY-MM-DD') : `${year}-12-31`;

    const toSave = entries.map((input) => {
      const row = existingById.get(input.employeeId) || this.leaveManagerRepository.create({
        employeeId: input.employeeId,
        year,
        createdBy: actor,
      });
      row.department = employeeById.get(input.employeeId)?.department || null;
      row.totalLeavesTaken = Number(input.totalLeavesTaken);
      row.asOfDate = asOfDate;
      row.updatedBy = actor || row.updatedBy;
      return row;
    });

    await this.leaveManagerRepository.save(toSave);
    this.logger.log(`Saved ${toSave.length} manual leave entries for ${year} (as of ${asOfDate}) by ${actor || 'unknown'}`);
    return { saved: toSave.length, year, asOfDate };
  }

  /** Approved leave requested after each employee's manual entry date (added on top of the entered total). */
  private async getApprovedLeavesAfterEntries(entries: LeaveManager[], year: number) {
    const result = new Map<string, number>();
    if (!entries.length) return result;

    const leaveTypes = [LeaveRequestType.APPLY_LEAVE, LeaveRequestType.LEAVE];
    await Promise.all(
      entries.map(async (entry) => {
        const row = await this.leaveRequestRepository
          .createQueryBuilder('lr')
          .select('SUM(lr.duration)', 'total')
          .where('lr.employeeId = :employeeId', { employeeId: entry.employeeId })
          .andWhere(
            '(lr.requestType IN (:...leaveTypes) OR lr.firstHalf = :leave OR lr.secondHalf = :leave)',
            { leaveTypes, leave: AttendanceStatus.LEAVE },
          )
          .andWhere('lr.status = :status', { status: LeaveRequestStatus.APPROVED })
          .andWhere('lr.fromDate > :asOfDate', { asOfDate: dayjs(entry.asOfDate).format('YYYY-MM-DD') })
          .andWhere('lr.fromDate <= :yearEnd', { yearEnd: `${year}-12-31` })
          .getRawOne();
        result.set(entry.employeeId, parseFloat(row?.total || '0'));
      }),
    );
    return result;
  }

  private accrualMonthFor(year: number): number {
    const now = dayjs();
    return year === now.year() ? now.month() + 1 : 12;
  }

  private assertYear(year: number) {
    if (!Number.isInteger(year) || year < 2000 || year > dayjs().year()) {
      throw new BadRequestException('A valid year (not in the future) is required');
    }
  }
}
