import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AttendanceCorrectionRequest } from '../entities/attendance-correction-request.entity';
import { AttendanceCorrectionStatus } from '../enums/attendance-correction-status.enum';
import {
  CreateAttendanceCorrectionDto,
  UpdateAttendanceCorrectionStatusDto,
} from '../dto/attendance-correction-request.dto';
import { EmployeeAttendanceService } from './employeeAttendance.service';
import {
  assertCorrectionTimesAllowed,
  toTimeOnly,
} from '../utils/attendance-time.util';

@Injectable()
export class AttendanceCorrectionService {
  private readonly logger = new Logger(AttendanceCorrectionService.name);

  constructor(
    @InjectRepository(AttendanceCorrectionRequest)
    private readonly correctionRepository: Repository<AttendanceCorrectionRequest>,
    private readonly employeeAttendanceService: EmployeeAttendanceService,
  ) {}

  async create(dto: CreateAttendanceCorrectionDto): Promise<AttendanceCorrectionRequest> {
    const workDate = new Date(dto.workingDate);
    workDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (workDate >= today) {
      throw new BadRequestException(
        'Request Change is only allowed for past dates. Use face check-in/out for today.',
      );
    }

    const startOfDay = new Date(workDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(workDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingPending = await this.correctionRepository.findOne({
      where: {
        employeeId: dto.employeeId,
        workingDate: Between(startOfDay, endOfDay),
        status: AttendanceCorrectionStatus.PENDING,
      },
    });

    if (existingPending) {
      throw new BadRequestException(
        'A pending correction request already exists for this date.',
      );
    }

    const attendance = await this.employeeAttendanceService.findAttendanceForDate(
      dto.employeeId,
      workDate,
    );
    const leaveKind = this.employeeAttendanceService.getDayLeaveKind(attendance);

    assertCorrectionTimesAllowed(
      leaveKind,
      dto.requestedCheckInTime,
      dto.requestedCheckOutTime,
      workDate,
    );

    const record = this.correctionRepository.create({
      employeeId: dto.employeeId,
      workingDate: startOfDay,
      requestedCheckInTime: toTimeOnly(dto.requestedCheckInTime),
      requestedCheckOutTime: toTimeOnly(dto.requestedCheckOutTime),
      reason: dto.reason.trim(),
      status: AttendanceCorrectionStatus.PENDING,
    });

    return this.correctionRepository.save(record);
  }

  async findByEmployee(
    employeeId: string,
    month?: string,
    year?: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<AttendanceCorrectionRequest[]> {
    const now = new Date();
    let start: Date;
    let end: Date;

    if (fromDate || toDate) {
      start = fromDate
        ? new Date(`${fromDate}T00:00:00`)
        : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = toDate
        ? new Date(`${toDate}T23:59:59.999`)
        : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      const resolvedMonth = month || String(now.getMonth() + 1).padStart(2, '0');
      const resolvedYear = year || String(now.getFullYear());
      start = new Date(`${resolvedYear}-${resolvedMonth.padStart(2, '0')}-01T00:00:00`);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    return this.correctionRepository.find({
      where: {
        employeeId,
        workingDate: Between(start, end),
      },
      order: { workingDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async findPendingForManager(): Promise<AttendanceCorrectionRequest[]> {
    return this.correctionRepository.find({
      where: { status: AttendanceCorrectionStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  async findHistoryForManager(
    fromDate?: string,
    toDate?: string,
  ): Promise<AttendanceCorrectionRequest[]> {
    const now = new Date();
    const start = fromDate
      ? new Date(`${fromDate}T00:00:00`)
      : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = toDate
      ? new Date(`${toDate}T23:59:59.999`)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    return this.correctionRepository.find({
      where: {
        workingDate: Between(start, end),
      },
      order: {
        workingDate: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: number): Promise<AttendanceCorrectionRequest> {
    const record = await this.correctionRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Correction request ${id} not found`);
    }
    return record;
  }

  async updateStatus(
    id: number,
    dto: UpdateAttendanceCorrectionStatusDto,
    reviewerName: string,
  ): Promise<AttendanceCorrectionRequest> {
    const record = await this.findOne(id);

    if (record.status !== AttendanceCorrectionStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be updated.');
    }

    if (dto.status === AttendanceCorrectionStatus.APPROVED) {
      const attendance = await this.employeeAttendanceService.applyApprovedCorrection(
        record.employeeId,
        new Date(record.workingDate),
        record.requestedCheckInTime,
        record.requestedCheckOutTime,
      );
      record.attendanceId = attendance.id;
      record.status = AttendanceCorrectionStatus.APPROVED;
      record.reviewedBy = reviewerName;
      record.reviewedAt = new Date();
      record.rejectionReason = null;
    } else if (dto.status === AttendanceCorrectionStatus.REJECTED) {
      record.status = AttendanceCorrectionStatus.REJECTED;
      record.reviewedBy = reviewerName;
      record.reviewedAt = new Date();
      record.rejectionReason = dto.rejectionReason?.trim() || 'Rejected';
    } else {
      throw new BadRequestException('Invalid status for correction request.');
    }

    return this.correctionRepository.save(record);
  }

  async hasPendingForDate(employeeId: string, workingDate: Date): Promise<boolean> {
    const d = new Date(workingDate);
    d.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    const count = await this.correctionRepository.count({
      where: {
        employeeId,
        workingDate: Between(d, end),
        status: AttendanceCorrectionStatus.PENDING,
      },
    });
    return count > 0;
  }
}
