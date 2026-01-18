import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, And } from 'typeorm';
import { TimesheetBlocker } from '../entities/timesheetBlocker.entity';

@Injectable()
export class TimesheetBlockerService {
  constructor(
    @InjectRepository(TimesheetBlocker)
    private readonly blockerRepository: Repository<TimesheetBlocker>,
  ) {}

  async create(data: Partial<TimesheetBlocker>): Promise<TimesheetBlocker> {
    const blocker = this.blockerRepository.create(data);
    return await this.blockerRepository.save(blocker);
  }

  async findAllByEmployee(employeeId: string): Promise<TimesheetBlocker[]> {
    return await this.blockerRepository.find({
      where: { employeeId },
      order: { blockedFrom: 'ASC' },
    });
  }

  async remove(id: number): Promise<void> {
    await this.blockerRepository.delete(id);
  }

  async isBlocked(employeeId: string, date: Date | string): Promise<boolean> {
    const checkDate = typeof date === 'string' ? new Date(date) : date;
    
    // Normalize date to YYYY-MM-DD for comparison if needed, 
    // but TypeORM works well with Date objects for 'date' columns.
    
    const blocker = await this.blockerRepository.findOne({
      where: {
        employeeId,
        blockedFrom: LessThanOrEqual(checkDate),
        blockedTo: MoreThanOrEqual(checkDate),
      },
    });

    return !!blocker;
  }
}
