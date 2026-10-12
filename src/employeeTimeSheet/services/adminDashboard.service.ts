import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import dayjs from 'dayjs';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { EmployeeAttendance } from '../entities/employeeAttendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { MasterHolidays } from '../../master/models/master-holidays.entity';
import { ManagerMapping, ManagerMappingStatus } from '../../managerMapping/entities/managerMapping.entity';
import { User } from '../../users/entities/user.entity';
import { UserStatus } from '../../users/enums/user-status.enum';
import { LeaveRequestStatus } from '../enums/leave-notification-status.enum';
import { AttendanceStatus } from '../enums/attendance-status.enum';

export type TodayCategory = 'office' | 'wfh' | 'clientVisit' | 'onLeave' | 'halfDay' | 'notUpdated';

export type DashboardEventType = 'BIRTHDAY' | 'ANNIVERSARY' | 'HOLIDAY';

export interface EmployeeBrief {
  employeeId: string;
  fullName: string;
  department: string | null;
  designation: string | null;
}

export interface DashboardEvent {
  type: DashboardEventType;
  date: string;
  daysAway: number;
  title: string;
  employeeId?: string;
  fullName?: string;
  department?: string | null;
  designation?: string | null;
  years?: number;
}

/** Identifies a manager the same way the Employee Directory and Requests pages do. */
export interface ManagerScope {
  managerName?: string;
  managerId?: string;
}

const ACTIONABLE_REQUEST_STATUSES = [
  LeaveRequestStatus.PENDING,
  LeaveRequestStatus.REQUESTING_FOR_CANCELLATION,
  LeaveRequestStatus.REQUESTING_FOR_MODIFICATION,
];

const EFFECTIVE_APPROVED_STATUSES = [
  LeaveRequestStatus.APPROVED,
  LeaveRequestStatus.REQUESTING_FOR_CANCELLATION,
  LeaveRequestStatus.REQUESTING_FOR_MODIFICATION,
  LeaveRequestStatus.MODIFICATION_APPROVED,
  LeaveRequestStatus.CANCELLATION_REJECTED,
  LeaveRequestStatus.MODIFICATION_REJECTED,
];

const MAX_EVENT_WINDOW_DAYS = 365;

const SUMMARY_EMPLOYEE_FIELDS = [
  'id',
  'employeeId',
  'internId',
  'fullName',
  'department',
  'designation',
  'joiningDate',
  'dateOfBirth',
] as const;

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    @InjectRepository(EmployeeAttendance)
    private readonly employeeAttendanceRepository: Repository<EmployeeAttendance>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(MasterHolidays)
    private readonly holidayRepository: Repository<MasterHolidays>,
  ) {}

  async getSummary(eventWindowDays = 90) {
    try {
      const employees = await this.activeEmployeesQuery().getMany();
      return await this.buildSummary(employees, eventWindowDays);
    } catch (error) {
      this.rethrow(error, 'Failed to build admin dashboard summary');
    }
  }

  async getAttendanceSnapshot(dateStr: string) {
    try {
      const employees = await this.activeEmployeesQuery().getMany();
      return await this.buildTodaySnapshot(employees, dateStr);
    } catch (error) {
      this.rethrow(error, `Failed to build attendance snapshot for ${dateStr}`);
    }
  }

  /** Same as getSummary, limited to the employees actively mapped to the manager. */
  async getManagerSummary(scope: ManagerScope, eventWindowDays = 90) {
    try {
      const employees = await this.resolveTeamEmployees(scope);
      return await this.buildSummary(employees, eventWindowDays, { scoped: true });
    } catch (error) {
      this.rethrow(error, 'Failed to build manager dashboard summary');
    }
  }

  async getManagerAttendanceSnapshot(scope: ManagerScope, dateStr: string) {
    try {
      const employees = await this.resolveTeamEmployees(scope);
      return await this.buildTodaySnapshot(employees, dateStr);
    } catch (error) {
      this.rethrow(error, `Failed to build team attendance snapshot for ${dateStr}`);
    }
  }

  private async buildSummary(
    employees: EmployeeDetails[],
    eventWindowDays: number,
    { scoped = false }: { scoped?: boolean } = {},
  ) {
    const windowDays = Math.min(Math.max(eventWindowDays, 1), MAX_EVENT_WINDOW_DAYS);
    const today = dayjs().startOf('day');
    const todayStr = today.format('YYYY-MM-DD');
    const scopeIds = scoped ? this.collectIds(employees) : undefined;

    const [todaySnapshot, pendingApprovals, events] = await Promise.all([
      this.buildTodaySnapshot(employees, todayStr),
      this.buildPendingApprovals(scopeIds),
      this.buildEvents(employees, today, windowDays),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      totalEmployees: employees.length,
      today: todaySnapshot,
      pendingApprovals,
      events: { windowDays, items: events },
    };
  }

  /** Active employees with an ACTIVE manager_mapping row for this manager (manager excluded). */
  private async resolveTeamEmployees({ managerName, managerId }: ManagerScope): Promise<EmployeeDetails[]> {
    const matchers: string[] = [];
    const params: Record<string, string> = {};
    if (managerName) {
      matchers.push('mm.managerName LIKE :managerNameQuery');
      params.managerNameQuery = `%${managerName}%`;
    }
    if (managerId) {
      matchers.push('mm.managerName LIKE :managerIdQuery');
      params.managerIdQuery = `%${managerId}%`;
    }
    if (matchers.length === 0) return [];

    const query = this.activeEmployeesQuery()
      .innerJoin(
        ManagerMapping,
        'mm',
        'mm.employeeId = employee.employeeId AND mm.status = :mappingStatus',
        { mappingStatus: ManagerMappingStatus.ACTIVE },
      )
      .andWhere(`(${matchers.join(' OR ')})`, params);

    if (managerId) {
      query.andWhere('employee.employeeId != :managerId', { managerId });
    }

    return query.getMany();
  }

  /**
   * Employees counted on the dashboard: the employee record AND the login account must both be ACTIVE,
   * matching the Active status shown in the Employee Directory (Draft / no login / Inactive are excluded).
   */
  private activeEmployeesQuery() {
    return this.employeeDetailsRepository
      .createQueryBuilder('employee')
      .innerJoin(User, 'login', 'login.loginId = employee.employeeId')
      .select(SUMMARY_EMPLOYEE_FIELDS.map((field) => `employee.${field}`))
      .where('employee.userStatus = :activeStatus', { activeStatus: UserStatus.ACTIVE })
      .andWhere('login.status = :activeStatus');
  }

  private collectIds(employees: EmployeeDetails[]): string[] {
    return employees.flatMap((e) => [e.employeeId, e.internId].filter(Boolean) as string[]);
  }

  private rethrow(error: any, message: string): never {
    this.logger.error(`${message}: ${error.message}`, error.stack);
    if (error instanceof HttpException) throw error;
    throw new HttpException(`${message}: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private async buildTodaySnapshot(employees: EmployeeDetails[], todayStr: string) {
    const holiday = await this.holidayRepository.findOne({ where: { date: todayStr as any } });
    const weekday = dayjs(todayStr).day();
    const isWeekend = weekday === 0 || weekday === 6;

    const buckets: Record<TodayCategory, EmployeeBrief[]> = {
      office: [],
      wfh: [],
      clientVisit: [],
      onLeave: [],
      halfDay: [],
      notUpdated: [],
    };

    const allIds = this.collectIds(employees);

    const [records, approvedRequests] = allIds.length
      ? await Promise.all([
          this.employeeAttendanceRepository.find({
            where: { employeeId: In(allIds), workingDate: todayStr as any },
          }),
          this.leaveRequestRepository.find({
            where: {
              employeeId: In(allIds),
              status: In(EFFECTIVE_APPROVED_STATUSES),
              fromDate: LessThanOrEqual(todayStr),
              toDate: MoreThanOrEqual(todayStr),
            },
          }),
        ])
      : [[], []];

    const recordByEmployee = new Map(records.map((r) => [r.employeeId, r]));
    const requestByEmployee = new Map(approvedRequests.map((r) => [r.employeeId, r]));

    for (const emp of employees) {
      const ids = [emp.employeeId, emp.internId].filter(Boolean) as string[];
      const record = ids.map((id) => recordByEmployee.get(id)).find(Boolean);
      const request = ids.map((id) => requestByEmployee.get(id)).find(Boolean);

      const category =
        (record && this.categorizeAttendance(record)) ||
        (request && this.categorizeRequest(request)) ||
        'notUpdated';

      buckets[category].push({
        employeeId: emp.employeeId,
        fullName: emp.fullName,
        department: emp.department ?? null,
        designation: emp.designation ?? null,
      });
    }

    const counts = Object.fromEntries(
      Object.entries(buckets).map(([key, list]) => [key, list.length]),
    ) as Record<TodayCategory, number>;

    return {
      date: todayStr,
      isWorkingDay: !isWeekend && !holiday,
      isWeekend,
      holidayName: holiday?.name ?? null,
      counts,
      employees: buckets,
    };
  }

  private categorizeAttendance(record: EmployeeAttendance): TodayCategory | null {
    if (record.firstHalf || record.secondHalf) {
      const first = this.categorizeLabel(record.firstHalf);
      const second = this.categorizeLabel(record.secondHalf);
      if (first && second && first !== second && (first === 'onLeave' || second === 'onLeave')) {
        return 'halfDay';
      }
      return first || second;
    }

    const status = (record.status || '').toLowerCase();
    if (status === AttendanceStatus.LEAVE.toLowerCase() || status === AttendanceStatus.ABSENT.toLowerCase()) {
      return 'onLeave';
    }
    if (status === AttendanceStatus.HALF_DAY.toLowerCase()) return 'halfDay';

    const fromLocation = this.categorizeLabel(record.workLocation);
    if (fromLocation) return fromLocation;

    if (
      status === AttendanceStatus.FULL_DAY.toLowerCase() ||
      status.includes('present') ||
      Number(record.totalHours || 0) > 0
    ) {
      return 'office';
    }
    return null;
  }

  private categorizeRequest(request: LeaveRequest): TodayCategory | null {
    if (request.isHalfDay && request.firstHalf && request.secondHalf) {
      const fromHalves = this.categorizeAttendance({
        firstHalf: request.firstHalf,
        secondHalf: request.secondHalf,
      } as EmployeeAttendance);
      if (fromHalves) return fromHalves;
    }
    const type = String(request.requestType || '').toLowerCase();
    if (type.includes('+') || type.includes('half day')) return 'halfDay';
    return this.categorizeLabel(type);
  }

  private categorizeLabel(value?: string | null): TodayCategory | null {
    if (!value) return null;
    const v = value.toLowerCase();
    if (v.includes('leave') || v.includes('absent')) return 'onLeave';
    if (v.includes('wfh') || v.includes('work from home')) return 'wfh';
    if (v.includes('client visit')) return 'clientVisit';
    if (v.includes('office') || v.includes('present') || v.includes('full day')) return 'office';
    return null;
  }

  /** `scopeIds` limits to a manager's team; undefined means organisation-wide. */
  private async buildPendingApprovals(scopeIds?: string[]) {
    const byStatus = {
      pending: 0,
      cancellation: 0,
      modification: 0,
    };
    const byType: Record<string, number> = {
      Leave: 0,
      'Work From Home': 0,
      'Client Visit': 0,
      'Half Day': 0,
    };

    if (scopeIds && scopeIds.length === 0) {
      return { total: 0, byStatus, byType, recent: [], items: [] };
    }

    const query = this.leaveRequestRepository
      .createQueryBuilder('lr')
      .leftJoin(EmployeeDetails, 'ed', 'ed.employeeId = lr.employeeId')
      .select([
        'lr.id AS id',
        'lr.employeeId AS employeeId',
        'lr.requestType AS requestType',
        'lr.fromDate AS fromDate',
        'lr.toDate AS toDate',
        'lr.duration AS duration',
        'lr.status AS status',
        'lr.isHalfDay AS isHalfDay',
        'lr.createdAt AS createdAt',
        'ed.fullName AS fullName',
        'ed.department AS department',
        'ed.designation AS designation',
      ])
      .where('lr.status IN (:...statuses)', { statuses: ACTIONABLE_REQUEST_STATUSES })
      .orderBy('lr.createdAt', 'DESC');

    if (scopeIds) {
      query.andWhere('lr.employeeId IN (:...scopeIds)', { scopeIds });
    }

    const rows = await query.getRawMany();

    for (const row of rows) {
      if (row.status === LeaveRequestStatus.PENDING) byStatus.pending++;
      else if (row.status === LeaveRequestStatus.REQUESTING_FOR_CANCELLATION) byStatus.cancellation++;
      else if (row.status === LeaveRequestStatus.REQUESTING_FOR_MODIFICATION) byStatus.modification++;

      byType[this.normalizeRequestType(row.requestType, row.isHalfDay)]++;
    }

    const items = rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      fullName: row.fullName,
      department: row.department,
      designation: row.designation,
      requestType: row.requestType,
      fromDate: this.toYmd(row.fromDate),
      toDate: this.toYmd(row.toDate),
      duration: Number(row.duration || 0),
      status: row.status,
      createdAt: row.createdAt,
    }));

    return {
      total: rows.length,
      byStatus,
      byType,
      recent: items.slice(0, 6),
      items,
    };
  }

  private normalizeRequestType(requestType: string, isHalfDay: unknown): string {
    const type = String(requestType || '').toLowerCase();
    if (type.includes('+') || type.includes('half day') || isHalfDay === true || isHalfDay === 1) {
      return 'Half Day';
    }
    if (type.includes('work from home') || type === 'wfh') return 'Work From Home';
    if (type.includes('client visit')) return 'Client Visit';
    return 'Leave';
  }

  private async buildEvents(
    employees: EmployeeDetails[],
    today: dayjs.Dayjs,
    windowDays: number,
  ): Promise<DashboardEvent[]> {
    const windowEnd = today.add(windowDays, 'day');
    const events: DashboardEvent[] = [];

    for (const emp of employees) {
      const base = {
        employeeId: emp.employeeId,
        fullName: emp.fullName,
        department: emp.department ?? null,
        designation: emp.designation ?? null,
      };

      if (emp.dateOfBirth) {
        const next = this.nextOccurrence(this.toYmd(emp.dateOfBirth), today);
        if (next && !next.isAfter(windowEnd)) {
          events.push({
            ...base,
            type: 'BIRTHDAY',
            date: next.format('YYYY-MM-DD'),
            daysAway: next.diff(today, 'day'),
            title: `${emp.fullName}'s Birthday`,
          });
        }
      }

      if (emp.joiningDate) {
        const joinedStr = this.toYmd(emp.joiningDate);
        const next = this.nextOccurrence(joinedStr, today);
        const years = next ? next.year() - dayjs(joinedStr).year() : 0;
        if (next && years >= 1 && !next.isAfter(windowEnd)) {
          events.push({
            ...base,
            type: 'ANNIVERSARY',
            date: next.format('YYYY-MM-DD'),
            daysAway: next.diff(today, 'day'),
            title: `${emp.fullName} completes ${years} ${years === 1 ? 'year' : 'years'}`,
            years,
          });
        }
      }
    }

    const holidays = await this.holidayRepository.find({
      where: {
        date: MoreThanOrEqual(today.format('YYYY-MM-DD') as any),
      },
      order: { date: 'ASC' },
    });
    for (const holiday of holidays) {
      const date = dayjs(this.toYmd(holiday.date));
      if (date.isAfter(windowEnd)) break;
      events.push({
        type: 'HOLIDAY',
        date: date.format('YYYY-MM-DD'),
        daysAway: date.diff(today, 'day'),
        title: holiday.name,
      });
    }

    const typeOrder: Record<DashboardEventType, number> = { HOLIDAY: 0, BIRTHDAY: 1, ANNIVERSARY: 2 };
    return events.sort(
      (a, b) => a.daysAway - b.daysAway || typeOrder[a.type] - typeOrder[b.type] || a.title.localeCompare(b.title),
    );
  }

  /** Next calendar occurrence (today or later) of a recurring date; Feb 29 falls back to Feb 28 in non-leap years. */
  private nextOccurrence(ymd: string, today: dayjs.Dayjs): dayjs.Dayjs | null {
    const source = dayjs(ymd);
    if (!source.isValid()) return null;
    const build = (year: number) => {
      const daysInMonth = dayjs(new Date(year, source.month(), 1)).daysInMonth();
      return dayjs(new Date(year, source.month(), Math.min(source.date(), daysInMonth)));
    };
    const thisYear = build(today.year());
    return thisYear.isBefore(today, 'day') ? build(today.year() + 1) : thisYear;
  }

  private toYmd(value: Date | string | null | undefined): string {
    if (!value) return '';
    if (typeof value === 'string') return value.slice(0, 10);
    return dayjs(value).format('YYYY-MM-DD');
  }
}
