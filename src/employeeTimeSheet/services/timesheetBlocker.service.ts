import { Injectable, Logger, BadRequestException, ForbiddenException, NotFoundException, InternalServerErrorException, HttpException } from '@nestjs/common';
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
    const METHOD = 'create';
    this.logger.log(`[${METHOD}] Started creating timesheet blocker for employee: ${data.employeeId}`);
    
    try {
      // STEP 1: Creating entity
      this.logger.debug(`[${METHOD}][STEP 1] Creating blocker entity...`);
      const blocker = this.blockerRepository.create(data);
      
      // STEP 2: Saving to database
      this.logger.debug(`[${METHOD}][STEP 2] Saving to database...`);
      const saved = await this.blockerRepository.save(blocker);
      
      this.logger.log(`[${METHOD}] Successfully created blocker ID: ${saved.id}`);
      return saved;
    } catch (error) {
      this.logger.error(`[${METHOD}] Failed to create blocker. Error: ${error.message}`, error.stack);
      
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create timesheet blocker');
    }
  }

  async findAllByEmployee(employeeId: string): Promise<TimesheetBlocker[]> {
    const METHOD = 'findAllByEmployee';
    this.logger.log(`[${METHOD}] Fetching all blockers for employee: ${employeeId}`);
    
    try {
      const blockers = await this.blockerRepository.find({
        where: { employeeId },
        order: { blockedFrom: 'ASC' },
      });
      
      this.logger.log(`[${METHOD}] Found ${blockers.length} blockers`);
      return blockers;
    } catch (error) {
      this.logger.error(`[${METHOD}] Failed to fetch blockers. Error: ${error.message}`, error.stack);
      
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to fetch timesheet blockers');
    }
  }

  async remove(id: number, isAdmin: boolean = false, isManager: boolean = false, managerId?: string, managerName?: string): Promise<void> {
    const METHOD = 'remove';
    this.logger.log(`[${METHOD}] Started removing blocker ID: ${id}`);
    
    try {
      // STEP 1: Fetch blocker
      this.logger.debug(`[${METHOD}][STEP 1] Fetching blocker from database...`);
      const blocker = await this.blockerRepository.findOne({ where: { id } });
      
      if (!blocker) {
        this.logger.warn(`[${METHOD}][STEP 1] Blocker with ID ${id} not found`);
        throw new NotFoundException(`Blocker with ID ${id} not found`);
      }

      // STEP 2: Permission check
      this.logger.debug(`[${METHOD}][STEP 2] Checking permissions...`);
      if (!isAdmin) {
        if (!isManager) {
          this.logger.warn(`[${METHOD}][STEP 2] Non-admin/non-manager attempted removal`);
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
            this.logger.warn(`[${METHOD}][STEP 2] Manager ${managerName} not authorized for employee ${blocker.employeeId}`);
            throw new ForbiddenException('You can only remove blocks for your mapped employees or blocks you created.');
          }
        }
      }

      // STEP 3: Delete blocker
      this.logger.debug(`[${METHOD}][STEP 3] Deleting blocker...`);
      await this.blockerRepository.delete(id);
      
      this.logger.log(`[${METHOD}] Successfully removed blocker ID: ${id}`);
    } catch (error) {
      this.logger.error(`[${METHOD}] Failed to remove blocker ${id}. Error: ${error.message}`, error.stack);
      
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to remove timesheet blocker');
    }
  }

  async isBlocked(employeeId: string, date: Date | string): Promise<TimesheetBlocker | null> {
    const METHOD = 'isBlocked';
    const checkDate = typeof date === 'string' ? new Date(date) : date;
    const dateStr = checkDate.toISOString().split('T')[0];
    
    try {
      this.logger.debug(`[${METHOD}] Checking if timesheet is blocked for ${employeeId} on ${dateStr}`);
      
      const blocker = await this.blockerRepository.findOne({
        where: {
          employeeId,
          blockedFrom: LessThanOrEqual(checkDate),
          blockedTo: MoreThanOrEqual(checkDate),
        },
      });

      if (blocker) {
        this.logger.log(`[${METHOD}] Found active block for ${employeeId} on ${dateStr} (Block ID: ${blocker.id})`);
      }
      return blocker;
    } catch (error) {
       this.logger.error(`[${METHOD}] Error checking block status: ${error.message}`, error.stack);
       return null; 
    }
  }
}
