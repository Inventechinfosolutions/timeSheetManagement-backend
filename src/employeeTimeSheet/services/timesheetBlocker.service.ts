import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { TimesheetBlocker } from '../entities/timesheetBlocker.entity';
import { ManagerMapping, ManagerMappingStatus } from '../../managerMapping/entities/managerMapping.entity';

@Injectable()
export class TimesheetBlockerService {
  private readonly logger = new Logger(TimesheetBlockerService.name);

  constructor(
    @InjectRepository(TimesheetBlocker)
    private readonly blockerRepository: Repository<TimesheetBlocker>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepository: Repository<ManagerMapping>,
  ) {}

  async create(data: Partial<TimesheetBlocker>, isAdmin: boolean = false): Promise<TimesheetBlocker> {
    this.logger.log(`Creating timesheet blocker for employee ${data.employeeId}`);
    try {
      const blocker = this.blockerRepository.create(data);
      return await this.blockerRepository.save(blocker);
    } catch (error) {
      this.logger.error(`Error creating timesheet blocker for employee ${data.employeeId}`, error.stack);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findAllByEmployee(employeeId: string): Promise<TimesheetBlocker[]> {
    this.logger.log(`Fetching all timesheet blockers for employee ${employeeId}`);
    try {
      return await this.blockerRepository.find({
        where: { employeeId },
        order: { blockedFrom: 'ASC' },
      });
    } catch (error) {
      this.logger.error(`Error fetching timesheet blockers for employee ${employeeId}`, error.stack);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async remove(id: number, isAdmin: boolean = false, isManager: boolean = false, managerId?: string, managerName?: string): Promise<void> {
    this.logger.log(`Removing timesheet blocker ${id}`);
    try {
      const blocker = await this.blockerRepository.findOne({ where: { id } });
      if (!blocker) throw new NotFoundException(`Blocker with ID ${id} not found`);

      if (!isAdmin) {
        if (!isManager) {
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
            throw new ForbiddenException('You can only remove blocks for your mapped employees or blocks you created.');
          }
        }
      }

      await this.blockerRepository.delete(id);
    } catch (error) {
      this.logger.error(`Error removing timesheet blocker ${id}`, error.stack);
      if (error instanceof NotFoundException) throw error;
      if (error instanceof ForbiddenException) throw error;
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async isBlocked(employeeId: string, date: Date | string): Promise<TimesheetBlocker | null> {
    this.logger.log(`Checking if timesheet is blocked for employee ${employeeId} on ${date}`);
    try {
      const checkDate = typeof date === 'string' ? new Date(date) : date;
      
      const blocker = await this.blockerRepository.findOne({
        where: {
          employeeId,
          blockedFrom: LessThanOrEqual(checkDate),
          blockedTo: MoreThanOrEqual(checkDate),
        },
      });

      return blocker;
    } catch (error) {
      this.logger.error(`Error checking if timesheet is blocked for employee ${employeeId}`, error.stack);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
