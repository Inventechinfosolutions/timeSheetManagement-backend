import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  OnModuleInit,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MasterFinancialYear } from '../models/master-financialyear.entity';
import {
  CreateFinancialYearDto,
  FinancialYearWithQuartersDto,
  QuarterDetailResponseDto,
  QueryFinancialYearDto,
  UpdateFinancialYearDto,
} from '../dto/financial-year.dto';
import { FinancialYearQuarter } from '../enums/financial-year.enums';

@Injectable()
export class MasterFinancialYearService implements OnModuleInit {
  private readonly logger = new Logger(MasterFinancialYearService.name);

  constructor(
    @InjectRepository(MasterFinancialYear)
    private readonly financialYearRepository: Repository<MasterFinancialYear>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultFinancialYears();
  }

  /**
   * Dynamically seeds financial years around current date if not present.
   */
  async seedDefaultFinancialYears(): Promise<void> {
    try {
      const currentFy = this.calculateCurrentFinancialYearYears();
      const baseYear = currentFy.fromYear;

      // Dynamic window: 2 years back to 2 years ahead
      const yearsToSeed = [baseYear - 2, baseYear - 1, baseYear, baseYear + 1, baseYear + 2];

      for (const fromYear of yearsToSeed) {
        const toYear = fromYear + 1;
        const fyLabel = `${fromYear}-${toYear}`;

        const existing = await this.financialYearRepository.findOne({
          where: { financialYear: fyLabel },
        });

        if (!existing) {
          const entity = this.financialYearRepository.create({
            financialYear: fyLabel,
            fromYear,
            toYear,
            description: `Financial Year ${fyLabel}`,
          });
          await this.financialYearRepository.save(entity);
          this.logger.log(`Seeded financial year: ${fyLabel}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Could not seed default financial years: ${error.message}`);
    }
  }

  /**
   * Get all financial years dynamically with quarters attached.
   */
  async findAll(query?: QueryFinancialYearDto): Promise<FinancialYearWithQuartersDto[]> {
    try {
      const qb = this.financialYearRepository.createQueryBuilder('fy');

      if (query?.financialYear) {
        qb.andWhere('fy.financialYear = :financialYear', {
          financialYear: query.financialYear.trim(),
        });
      }

      if (query?.year) {
        qb.andWhere('(fy.fromYear = :year OR fy.toYear = :year)', {
          year: query.year,
        });
      }

      qb.orderBy('fy.fromYear', 'ASC');

      const records = await qb.getMany();
      return records.map((record) =>
        this.attachDynamicFinancialYearDetails(record, query?.quarter),
      );
    } catch (error) {
      this.logger.error(`Error in findAll financial years: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch financial years: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get the current financial year dynamically based on today's date.
   */
  async getCurrent(quarter?: FinancialYearQuarter): Promise<FinancialYearWithQuartersDto> {
    const { fromYear, toYear, label } = this.calculateCurrentFinancialYearYears();

    let fy = await this.financialYearRepository.findOne({
      where: { financialYear: label },
    });

    if (!fy) {
      // Auto-create dynamically if not in database
      fy = this.financialYearRepository.create({
        financialYear: label,
        fromYear,
        toYear,
        description: `Financial Year ${label}`,
      });
      await this.financialYearRepository.save(fy);
    }

    return this.attachDynamicFinancialYearDetails(fy, quarter);
  }

  /**
   * Find a financial year by string (e.g. 2025-2026).
   */
  async findByFinancialYear(
    financialYear: string,
    quarter?: FinancialYearQuarter,
  ): Promise<FinancialYearWithQuartersDto> {
    const formatted = financialYear.trim();
    const fy = await this.financialYearRepository.findOne({
      where: { financialYear: formatted },
    });

    if (!fy) {
      throw new NotFoundException(`Financial year '${formatted}' not found`);
    }

    return this.attachDynamicFinancialYearDetails(fy, quarter);
  }

  /**
   * Find a single financial year by ID.
   */
  async findOne(
    id: number,
    quarter?: FinancialYearQuarter,
  ): Promise<FinancialYearWithQuartersDto> {
    const fy = await this.financialYearRepository.findOne({
      where: { id },
    });

    if (!fy) {
      throw new NotFoundException(`Financial year with ID ${id} not found`);
    }

    return this.attachDynamicFinancialYearDetails(fy, quarter);
  }

  /**
   * Create a new financial year dynamically.
   */
  async create(createDto: CreateFinancialYearDto): Promise<FinancialYearWithQuartersDto> {
    const fromYear = Number(createDto.fromYear);
    const toYear = createDto.toYear ? Number(createDto.toYear) : fromYear + 1;
    const financialYear = createDto.financialYear
      ? createDto.financialYear.trim()
      : `${fromYear}-${toYear}`;

    const existing = await this.financialYearRepository.findOne({
      where: { financialYear },
    });

    if (existing) {
      throw new ConflictException(`Financial year '${financialYear}' already exists`);
    }

    const entity = this.financialYearRepository.create({
      financialYear,
      fromYear,
      toYear,
      description: createDto.description || `Financial Year ${financialYear}`,
    });

    const saved = await this.financialYearRepository.save(entity);
    return this.attachDynamicFinancialYearDetails(saved);
  }

  /**
   * Update an existing financial year.
   */
  async update(
    id: number,
    updateDto: UpdateFinancialYearDto,
  ): Promise<FinancialYearWithQuartersDto> {
    const fy = await this.financialYearRepository.findOne({
      where: { id },
    });

    if (!fy) {
      throw new NotFoundException(`Financial year with ID ${id} not found`);
    }

    if (updateDto.fromYear) {
      fy.fromYear = Number(updateDto.fromYear);
    }
    if (updateDto.toYear) {
      fy.toYear = Number(updateDto.toYear);
    } else if (updateDto.fromYear && !updateDto.toYear) {
      fy.toYear = fy.fromYear + 1;
    }

    if (updateDto.financialYear) {
      fy.financialYear = updateDto.financialYear.trim();
    } else if (updateDto.fromYear) {
      fy.financialYear = `${fy.fromYear}-${fy.toYear}`;
    }

    if (updateDto.description !== undefined) {
      fy.description = updateDto.description;
    }

    const saved = await this.financialYearRepository.save(fy);
    return this.attachDynamicFinancialYearDetails(saved);
  }

  /**
   * Attach dynamic quarter details (Q1, Q2, Q3, Q4) and computed dates for the financial year.
   */
  private attachDynamicFinancialYearDetails(
    fy: MasterFinancialYear,
    filterQuarter?: FinancialYearQuarter,
  ): FinancialYearWithQuartersDto {
    const startDate = `${fy.fromYear}-04-01`;
    const endDate = `${fy.toYear}-03-31`;

    const now = new Date();
    const currentDateStr = now.toISOString().split('T')[0];
    const isCurrent = currentDateStr >= startDate && currentDateStr <= endDate;

    const quarters = this.generateQuartersForFinancialYear(
      fy.fromYear,
      fy.toYear,
      filterQuarter,
    );

    return {
      id: fy.id,
      financialYear: fy.financialYear,
      fromYear: fy.fromYear,
      toYear: fy.toYear,
      description: fy.description,
      startDate,
      endDate,
      isCurrent,
      quarters,
      createdAt: fy.createdAt,
      updatedAt: fy.updatedAt,
      createdBy: fy.createdBy,
      updatedBy: fy.updatedBy,
    };
  }

  /**
   * Dynamically generate 4 quarters for a financial year (April to March).
   */
  private generateQuartersForFinancialYear(
    fromYear: number,
    toYear: number,
    filterQuarter?: FinancialYearQuarter,
  ): QuarterDetailResponseDto[] {
    const quarters: QuarterDetailResponseDto[] = [
      {
        quarter: FinancialYearQuarter.Q1,
        quarterName: 'Quarter 1',
        fromMonth: 'April',
        toMonth: 'June',
        fromMonthNumber: 4,
        toMonthNumber: 6,
        year: fromYear,
        startDate: `${fromYear}-04-01`,
        endDate: `${fromYear}-06-30`,
        months: ['April', 'May', 'June'],
        description: `April to June ${fromYear}`,
      },
      {
        quarter: FinancialYearQuarter.Q2,
        quarterName: 'Quarter 2',
        fromMonth: 'July',
        toMonth: 'September',
        fromMonthNumber: 7,
        toMonthNumber: 9,
        year: fromYear,
        startDate: `${fromYear}-07-01`,
        endDate: `${fromYear}-09-30`,
        months: ['July', 'August', 'September'],
        description: `July to September ${fromYear}`,
      },
      {
        quarter: FinancialYearQuarter.Q3,
        quarterName: 'Quarter 3',
        fromMonth: 'October',
        toMonth: 'December',
        fromMonthNumber: 10,
        toMonthNumber: 12,
        year: fromYear,
        startDate: `${fromYear}-10-01`,
        endDate: `${fromYear}-12-31`,
        months: ['October', 'November', 'December'],
        description: `October to December ${fromYear}`,
      },
      {
        quarter: FinancialYearQuarter.Q4,
        quarterName: 'Quarter 4',
        fromMonth: 'January',
        toMonth: 'March',
        fromMonthNumber: 1,
        toMonthNumber: 3,
        year: toYear,
        startDate: `${toYear}-01-01`,
        endDate: `${toYear}-03-31`,
        months: ['January', 'February', 'March'],
        description: `January to March ${toYear}`,
      },
    ];

    if (filterQuarter) {
      return quarters.filter((q) => q.quarter === filterQuarter);
    }

    return quarters;
  }

  /**
   * Dynamically calculate current financial year from today's date.
   */
  private calculateCurrentFinancialYearYears(date: Date = new Date()): {
    fromYear: number;
    toYear: number;
    label: string;
  } {
    const currentYear = date.getFullYear();
    const currentMonth = date.getMonth() + 1; // 1-12

    // In India: April (4) to Dec (12) -> FY currentYear - (currentYear + 1)
    // Jan (1) to Mar (3) -> FY (currentYear - 1) - currentYear
    const fromYear = currentMonth >= 4 ? currentYear : currentYear - 1;
    const toYear = fromYear + 1;

    return {
      fromYear,
      toYear,
      label: `${fromYear}-${toYear}`,
    };
  }
}
