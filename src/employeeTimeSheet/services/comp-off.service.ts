import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CompOff } from '../entities/comp-off.entity';
import { CompOffStatus } from '../enums/comp-off-status.enum';

@Injectable()
export class CompOffService {
  private readonly logger = new Logger(CompOffService.name);

  constructor(
    @InjectRepository(CompOff)
    private compOffRepository: Repository<CompOff>,
  ) {}

  async createOrUpdateCompOff(employeeId: string, attendanceDate: string, attendanceId: number, hours: number) {
    if (hours < 4 || hours > 9) return;

    let compOff = await this.compOffRepository.findOne({
      where: { employeeId, attendanceDate },
    });

    if (!compOff) {
      compOff = new CompOff();
      compOff.employeeId = employeeId;
      compOff.attendanceDate = attendanceDate;
    }

    compOff.attendanceId = attendanceId;
    compOff.status = CompOffStatus.NOT_TAKEN;
    compOff.remainingDays = 1.0; // 4-9 hours earns 1 full Comp Off

    return await this.compOffRepository.save(compOff);
  }

  async getAvailableBalance(employeeId: string, includeRequestId?: number): Promise<number> {
    const list = await this.compOffRepository.find({
      where: [
        { employeeId, status: CompOffStatus.NOT_TAKEN },
        { employeeId, status: CompOffStatus.HALF_TAKEN },
        ...(includeRequestId
          ? [{ employeeId, status: CompOffStatus.PENDING, leaveRequestId: includeRequestId }]
          : []),
      ],
    });
    return list.reduce((sum, item) => sum + (Number(item.remainingDays) || 0), 0);
  }

  async getAvailableCompOffs(employeeId: string) {
    return await this.compOffRepository.find({
      where: [
        { employeeId, status: CompOffStatus.NOT_TAKEN },
        { employeeId, status: CompOffStatus.HALF_TAKEN },
      ],
      order: { attendanceDate: 'ASC' },
    });
  }

  async markAsPending(
    employeeId: string,
    creditDates: string[],
    leaveDates: string[],
    durationPerDay: number,
    leaveRequestId: number,
    halfDayLabel: string = 'Full',
  ) {
    this.logger.debug(
      `[MARK_PENDING] Credits: ${creditDates.join(', ')} for Leave: ${leaveDates.join(', ')}`,
    );

    for (let i = 0; i < creditDates.length; i++) {
      const creditDate = creditDates[i];
      const leaveDate = leaveDates[i];
      if (!leaveDate) break;

      const compOff = await this.compOffRepository.findOne({
        where: { employeeId, attendanceDate: creditDate },
      });

      if (compOff) {
        let takenDatesObj: any = {};
        if (compOff.takenDates) {
          try {
            takenDatesObj = JSON.parse(compOff.takenDates);
          } catch (e) {}
        }

        takenDatesObj[leaveDate] = durationPerDay === 0.5 ? halfDayLabel : 'Full';
        compOff.takenDates = JSON.stringify(takenDatesObj);
        compOff.remainingDays = Number((compOff.remainingDays - durationPerDay).toFixed(1));
        compOff.status = CompOffStatus.PENDING;
        compOff.leaveRequestId = leaveRequestId;

        this.logger.debug(
          `[MARK_PENDING] Updating CompOff ID: ${compOff.id} for Date: ${creditDate}, Remaining: ${compOff.remainingDays}, Taken: ${compOff.takenDates}`,
        );
        await this.compOffRepository.save(compOff);
      } else {
        this.logger.warn(`[MARK_PENDING] Credit record NOT FOUND for date: ${creditDate}`);
      }
    }
  }

  async consumeCompOffs(leaveRequestId: number) {
    const pendingCompOffs = await this.compOffRepository.find({
      where: { leaveRequestId, status: CompOffStatus.PENDING },
    });

    for (const compOff of pendingCompOffs) {
      compOff.status = compOff.remainingDays <= 0 ? CompOffStatus.FULL_TAKEN : CompOffStatus.HALF_TAKEN;
      await this.compOffRepository.save(compOff);
    }
  }

  async restoreCompOffs(leaveRequestId: number) {
    const records = await this.compOffRepository.find({
      where: { leaveRequestId },
    });

    for (const compOff of records) {
      if (!compOff.takenDates) {
        compOff.leaveRequestId = null;
        compOff.status = compOff.remainingDays >= 1.0 ? CompOffStatus.NOT_TAKEN : CompOffStatus.HALF_TAKEN;
        await this.compOffRepository.save(compOff);
        continue;
      }

      try {
        const takenDatesObj = JSON.parse(compOff.takenDates);
        let restoredAmount = 0;
        for (const date in takenDatesObj) {
          restoredAmount +=
            takenDatesObj[date].includes('Half') ||
            takenDatesObj[date].includes('First') ||
            takenDatesObj[date].includes('Second')
              ? 0.5
              : 1.0;
        }

        compOff.remainingDays = Number((compOff.remainingDays + restoredAmount).toFixed(1));
        compOff.takenDates = null;
        compOff.leaveRequestId = null;

        if (compOff.remainingDays >= 1.0) {
          compOff.status = CompOffStatus.NOT_TAKEN;
        } else if (compOff.remainingDays > 0) {
          compOff.status = CompOffStatus.HALF_TAKEN;
        } else {
          compOff.status = CompOffStatus.FULL_TAKEN;
        }

        await this.compOffRepository.save(compOff);
      } catch (e) {
        // Fallback restoration
        compOff.remainingDays = 1.0;
        compOff.status = CompOffStatus.NOT_TAKEN;
        compOff.leaveRequestId = null;
        compOff.takenDates = null;
        await this.compOffRepository.save(compOff);
      }
    }
  }

  async getCompOffHistory(
    employeeId: string,
    page: number,
    limit: number,
    month?: string,
    year?: string,
    status?: string,
  ) {
    const query = this.compOffRepository
      .createQueryBuilder('compOff')
      .leftJoinAndSelect('compOff.employee', 'employee')
      .where('compOff.employeeId = :employeeId', { employeeId });

    if (year && year !== 'All Years' && year !== 'All') {
      if (month && month !== 'All Months' && month !== 'All') {
        const monthStr = month.padStart(2, '0');
        query.andWhere('compOff.attendanceDate LIKE :ym', { ym: `${year}-${monthStr}-%` });
      } else {
        query.andWhere('compOff.attendanceDate LIKE :y', { y: `${year}-%` });
      }
    } else if (month && month !== 'All Months' && month !== 'All') {
      const monthStr = month.padStart(2, '0');
      query.andWhere('compOff.attendanceDate LIKE :m', { m: `%-${monthStr}-%` });
    }

    if (status && status !== 'All Status' && status !== 'All') {
      let statusValue = status;
      if (status === 'NOT_TAKEN' || status === 'Not Taken') statusValue = CompOffStatus.NOT_TAKEN;
      else if (status === 'FULL_TAKEN' || status === 'Full Taken') statusValue = CompOffStatus.FULL_TAKEN;
      else if (status === 'HALF_TAKEN' || status === 'Half Taken') statusValue = CompOffStatus.HALF_TAKEN;
      else if (status === 'PENDING' || status === 'Pending') statusValue = CompOffStatus.PENDING;
      query.andWhere('compOff.status = :status', { status: statusValue });
    }

    const [items, totalItems] = await query
      .orderBy('compOff.attendanceDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: page,
    };
  }

  async calculateTotalDays(employeeId: string, dates: string[]) {
    if (!dates || dates.length === 0) return 0;

    const compOffs = await this.compOffRepository.find({
      where: [
        { employeeId, attendanceDate: In(dates), status: CompOffStatus.NOT_TAKEN },
        { employeeId, attendanceDate: In(dates), status: CompOffStatus.HALF_TAKEN },
      ],
    });

    return compOffs.reduce((acc, curr) => acc + (curr.remainingDays || 0), 0);
  }

  async deleteByAttendanceId(attendanceId: number): Promise<void> {
    this.logger.log(`[COMP_OFF_DELETE] Attempting to delete/unlink comp-off for attendanceId: ${attendanceId}`);

    const compOff = await this.compOffRepository.findOne({ where: { attendanceId } });
    if (!compOff) {
      this.logger.log(`[COMP_OFF_DELETE] No comp-off found for attendanceId: ${attendanceId}`);
      return;
    }

    if (compOff.status === CompOffStatus.NOT_TAKEN || compOff.status === CompOffStatus.PENDING) {
      await this.compOffRepository.delete(compOff.id);
      this.logger.log(`[COMP_OFF_DELETE] Hard-deleted comp-off ID: ${compOff.id} (status: ${compOff.status})`);
    } else {
      compOff.attendanceId = null as any;
      await this.compOffRepository.save(compOff);
      this.logger.log(`[COMP_OFF_DELETE] Unlinked attendanceId from comp-off ID: ${compOff.id} (status: ${compOff.status})`);
    }
  }
}
