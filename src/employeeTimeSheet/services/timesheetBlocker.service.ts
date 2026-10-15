import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { TimesheetBlocker } from '../entities/timesheetBlocker.entity';
import { ManagerMapping, ManagerMappingStatus } from '../../managerMapping/entities/managerMapping.entity';
import { NotificationsService } from '../../notifications/Services/notifications.service';
import dayjs from 'dayjs';

@Injectable()
export class TimesheetBlockerService {
  private readonly logger = new Logger(TimesheetBlockerService.name);

  constructor(
    @InjectRepository(TimesheetBlocker)
    private readonly blockerRepository: Repository<TimesheetBlocker>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepository: Repository<ManagerMapping>,
    private readonly notificationsService: NotificationsService,
  ) { }

  async create(data: Partial<TimesheetBlocker>, isAdmin: boolean = false): Promise<TimesheetBlocker> {
    this.logger.log(`Starting creation of timesheet blocker for employee: ${data.employeeId}`);
    try {
      const blocker = this.blockerRepository.create(data);
      const saved = await this.blockerRepository.save(blocker);
      this.logger.log(`Successfully created timesheet blocker ID: ${saved.id} for employee: ${data.employeeId}`);

      if (saved.employeeId) {
        try {
          const fromStr = saved.blockedFrom
            ? dayjs(saved.blockedFrom).format('DD MMM YYYY')
            : 'specified dates';
          const toStr = saved.blockedTo
            ? dayjs(saved.blockedTo).format('DD MMM YYYY')
            : '';
          const dateRange = toStr ? `${fromStr} to ${toStr}` : fromStr;
          const reasonSuffix = saved.reason?.trim() ? `\nReason: ${saved.reason.trim()}` : '';

          await this.notificationsService.createNotification({
            employeeId: saved.employeeId.trim(),
            title: 'Timesheet Blocked',
            message: `Your timesheet has been blocked for ${dateRange}.${reasonSuffix}\nPlease contact your manager or admin for assistance.`,
            type: 'TIMESHEET_BLOCKED',
          });
        } catch (notifErr: any) {
          this.logger.warn(`Could not dispatch timesheet blocker notification: ${notifErr?.message || notifErr}`);
        }
      }

      return saved;
    } catch (error) {
      this.logger.error(`Failed to create timesheet blocker for employee ${data.employeeId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to create timesheet blocker: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findAllByEmployee(employeeId: string): Promise<TimesheetBlocker[]> {
    this.logger.log(`Fetching all timesheet blockers for employee: ${employeeId}`);
    try {
      const blockers = await this.blockerRepository.find({
        where: { employeeId },
        order: { blockedFrom: 'ASC' },
      });
      this.logger.log(`Retrieved ${blockers.length} blockers for employee: ${employeeId}`);
      return blockers;
    } catch (error) {
      this.logger.error(`Failed to fetch timesheet blockers for employee ${employeeId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch timesheet blockers: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async remove(id: number, isAdmin: boolean = false, isManager: boolean = false, managerId?: string, managerName?: string): Promise<void> {
    this.logger.log(`Starting removal of timesheet blocker ID: ${id}. Requestor: Admin=${isAdmin}, Manager=${isManager}`);
    try {
      const blocker = await this.blockerRepository.findOne({ where: { id } });
      if (!blocker) {
        this.logger.warn(`Removal failed: Blocker ID ${id} not found`);
        throw new NotFoundException(`Blocker with ID ${id} not found`);
      }

      if (!isAdmin) {
        if (!isManager) {
          this.logger.warn(`Removal unauthorized: Only Admins or Managers can remove blocks. User ID: ${managerId || 'Unknown'}`);
          throw new ForbiddenException('Only Admins or Managers can remove timesheet blocks.');
        }

        // If Manager, check if they are the one who blocked it OR if the employee is mapped to them
        const isRecordOwner = blocker.blockedBy === managerName || blocker.blockedBy === managerId;

        if (!isRecordOwner) {
          const mapping = await this.managerMappingRepository.findOne({
            where: [
              { employeeId: blocker.employeeId, managerName: managerName, status: ManagerMappingStatus.ACTIVE }
            ]
          });

          if (!mapping) {
            this.logger.warn(`Removal unauthorized: Manager ${managerId || managerName} is not the owner and does not have a mapping for employee ${blocker.employeeId}`);
            throw new ForbiddenException('You can only remove blocks for your mapped employees or blocks you created.');
          }
        }
      }

      const empId = blocker.employeeId;
      const fromStr = blocker.blockedFrom
        ? dayjs(blocker.blockedFrom).format('DD MMM YYYY')
        : '';
      const toStr = blocker.blockedTo
        ? dayjs(blocker.blockedTo).format('DD MMM YYYY')
        : '';
      const dateRange = toStr ? `${fromStr} to ${toStr}` : fromStr;

      await this.blockerRepository.delete(id);
      this.logger.log(`Successfully removed timesheet blocker ID: ${id}`);

      if (empId) {
        try {
          await this.notificationsService.createNotification({
            employeeId: empId.trim(),
            title: 'Timesheet Unblocked',
            message: `Your timesheet block for ${dateRange} has been removed. You can now log your hours.`,
            type: 'TIMESHEET_UNBLOCKED',
          });
        } catch (notifErr: any) {
          this.logger.warn(`Could not dispatch timesheet unblock notification: ${notifErr?.message || notifErr}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to remove timesheet blocker ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to remove timesheet blocker: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async isBlocked(employeeId: string, date: Date | string): Promise<TimesheetBlocker | null> {
    const dateStr = typeof date === 'string' ? date.slice(0, 10) : dayjs(date).format('YYYY-MM-DD');
    this.logger.log(`Checking block status for employee: ${employeeId} on date: ${dateStr}`);
    try {
      const blocker = await this.blockerRepository
        .createQueryBuilder('b')
        .where('b.employeeId = :employeeId', { employeeId })
        .andWhere(':dateStr >= b.blockedFrom AND :dateStr <= b.blockedTo', { dateStr })
        .getOne();

      if (blocker) {
        this.logger.log(`Found active block for employee ${employeeId} on date ${dateStr} (Blocker ID: ${blocker.id})`);
      } else {
        this.logger.debug(`No active block found for employee ${employeeId} on date ${dateStr}`);
      }

      return blocker;
    } catch (error) {
      this.logger.error(`Failed to check block status for employee ${employeeId} on date ${dateStr}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to check block status: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
