import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  HttpException,
  HttpStatus,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MasterQuaterly } from '../models/master-quaterly.entity';
import { QueryQuaterlyDto } from '../dto/query-quaterly.dto';
import { QuaterlyEnum } from '../enums/quaterly.enums';

export interface QuaterlyResponseWithDates extends MasterQuaterly {
  year?: number;
  startDate?: string;
  endDate?: string;
  months?: string[];
}

@Injectable()
export class MasterQuaterlyService implements OnModuleInit {
  private readonly logger = new Logger(MasterQuaterlyService.name);

  constructor(
    @InjectRepository(MasterQuaterly)
    private readonly quaterlyRepository: Repository<MasterQuaterly>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultQuarters();
  }

  /**
   * Dynamically seeds default quarters (Q1, Q2, Q3, Q4) if table is empty.
   */
  async seedDefaultQuarters(): Promise<void> {
    try {
      const count = await this.quaterlyRepository.count();
      if (count === 0) {
        this.logger.log('Seeding initial Master Quaterly data...');
        const defaultQuarters: Partial<MasterQuaterly>[] = [
          {
            quaterLabel: QuaterlyEnum.Q1,
            fromMonth: 'April',
            toMonth: 'June',
            description: 'April to June',
          },
          {
            quaterLabel: QuaterlyEnum.Q2,
            fromMonth: 'July',
            toMonth: 'September',
            description: 'July to September',
          },
          {
            quaterLabel: QuaterlyEnum.Q3,
            fromMonth: 'October',
            toMonth: 'December',
            description: 'October to December',
          },
          {
            quaterLabel: QuaterlyEnum.Q4,
            fromMonth: 'January',
            toMonth: 'March',
            description: 'January to March',
          },
        ];

        for (const q of defaultQuarters) {
          const entity = this.quaterlyRepository.create(q);
          await this.quaterlyRepository.save(entity);
        }
        this.logger.log('Default Master Quaterly data seeded successfully.');
      }
    } catch (error) {
      this.logger.warn(`Could not seed default quarters: ${error.message}`);
    }
  }

  /**
   * Get all quarters or filter by selected quarter (Q1, Q2, Q3, Q4).
   * When an employee selects a quarter, only that particular quarter's data is returned.
   */
  async findAll(query?: QueryQuaterlyDto): Promise<QuaterlyResponseWithDates | QuaterlyResponseWithDates[]> {
    const selectedYear = query?.year || new Date().getFullYear();

    if (query?.quarter) {
      this.logger.log(`Fetching specific quarter: ${query.quarter} for year: ${selectedYear}`);
      return this.findByQuarter(query.quarter, selectedYear);
    }

    this.logger.log(`Fetching all quarters dynamically for year: ${selectedYear}`);
    try {
      const quarters = await this.quaterlyRepository.find({
        order: { id: 'ASC' },
      });

      return quarters.map((quarter) => this.attachDynamicQuarterDetails(quarter, selectedYear));
    } catch (error) {
      this.logger.error(`Error fetching quarters: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch quarters: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Find a specific quarter by label (Q1, Q2, Q3, Q4) dynamically.
   */
  async findByQuarter(quaterLabel: QuaterlyEnum | string, year?: number): Promise<QuaterlyResponseWithDates> {
    const selectedYear = year || new Date().getFullYear();
    const formattedLabel = quaterLabel.toString().trim().toUpperCase();

    try {
      const quarter = await this.quaterlyRepository.findOne({
        where: { quaterLabel: formattedLabel },
      });

      if (!quarter) {
        throw new NotFoundException(`Quarter '${formattedLabel}' not found`);
      }

      return this.attachDynamicQuarterDetails(quarter, selectedYear);
    } catch (error) {
      this.logger.error(`Error fetching quarter ${formattedLabel}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch quarter ${formattedLabel}: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Find a single quarter by ID.
   */
  async findOne(id: number, year?: number): Promise<QuaterlyResponseWithDates> {
    const selectedYear = year || new Date().getFullYear();
    try {
      const quarter = await this.quaterlyRepository.findOne({
        where: { id },
      });

      if (!quarter) {
        throw new NotFoundException(`Quarter with ID ${id} not found`);
      }

      return this.attachDynamicQuarterDetails(quarter, selectedYear);
    } catch (error) {
      this.logger.error(`Error fetching quarter ID ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch quarter ${id}: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Dynamically calculates start date, end date, and month list for a quarter based on the fiscal year.
   */
  private attachDynamicQuarterDetails(quarter: MasterQuaterly, year: number): QuaterlyResponseWithDates {
    const fromMonth = this.getMonthNumberFromName(quarter.fromMonth);
    const toMonth = this.getMonthNumberFromName(quarter.toMonth);

    // In Indian Fiscal Year (April to March):
    // Q1: Apr-Jun (Year)
    // Q2: Jul-Sep (Year)
    // Q3: Oct-Dec (Year)
    // Q4: Jan-Mar (Year + 1)
    const isNextYearForQ4 = fromMonth < 4 && quarter.quaterLabel === 'Q4';
    const startYear = isNextYearForQ4 ? year + 1 : year;
    const endYear = isNextYearForQ4 ? year + 1 : year;

    const startMonthStr = String(fromMonth).padStart(2, '0');
    const endMonthStr = String(toMonth).padStart(2, '0');

    // Get last day of the end month dynamically
    const lastDay = new Date(endYear, toMonth, 0).getDate();

    const startDate = `${startYear}-${startMonthStr}-01`;
    const endDate = `${endYear}-${endMonthStr}-${String(lastDay).padStart(2, '0')}`;

    const months = this.generateMonthNames(fromMonth, toMonth);

    return {
      ...quarter,
      year,
      startDate,
      endDate,
      months,
    };
  }

  private getMonthNumberFromName(monthName: string): number {
    const monthMap: Record<string, number> = {
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12,
    };
    return monthMap[monthName?.toLowerCase()?.trim()] || 1;
  }

  private generateMonthNames(fromMonthNum: number, toMonthNum: number): string[] {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const result: string[] = [];
    if (fromMonthNum <= toMonthNum) {
      for (let m = fromMonthNum; m <= toMonthNum; m++) {
        result.push(monthNames[m - 1]);
      }
    } else {
      // Cross-year wrap
      for (let m = fromMonthNum; m <= 12; m++) {
        result.push(monthNames[m - 1]);
      }
      for (let m = 1; m <= toMonthNum; m++) {
        result.push(monthNames[m - 1]);
      }
    }
    return result;
  }
}
