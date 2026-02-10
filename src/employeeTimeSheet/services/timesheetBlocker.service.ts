import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { TimesheetBlocker } from '../entities/timesheetBlocker.entity';
import { ManagerMapping, ManagerMappingStatus } from '../../managerMapping/entities/managerMapping.entity';

@Injectable()
export class TimesheetBlockerService {
  constructor(
    @InjectRepository(TimesheetBlocker)
    private readonly blockerRepository: Repository<TimesheetBlocker>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepository: Repository<ManagerMapping>,
  ) {}

  async create(data: Partial<TimesheetBlocker>, isAdmin: boolean = false): Promise<TimesheetBlocker> {
    const blocker = this.blockerRepository.create(data);
    return await this.blockerRepository.save(blocker);
  }

  async findAllByEmployee(employeeId: string): Promise<TimesheetBlocker[]> {
    return await this.blockerRepository.find({
      where: { employeeId },
      order: { blockedFrom: 'ASC' },
    });
  }

  async remove(id: number, isAdmin: boolean = false, isManager: boolean = false, managerId?: string, managerName?: string): Promise<void> {
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
  }

  async isBlocked(employeeId: string, date: Date | string): Promise<TimesheetBlocker | null> {
    const checkDate = typeof date === 'string' ? new Date(date) : date;
    
    const blocker = await this.blockerRepository.findOne({
      where: {
        employeeId,
        blockedFrom: LessThanOrEqual(checkDate),
        blockedTo: MoreThanOrEqual(checkDate),
      },
    });

    return blocker;
  }
}
