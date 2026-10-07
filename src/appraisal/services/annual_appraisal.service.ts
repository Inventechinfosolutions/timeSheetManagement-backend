import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnnualAppraisalSummary } from '../entities/annual_appraisal.entity';
import { QuarterlyReview } from '../entities/quarterly_review.entities';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { ManagerMapping } from '../../managerMapping/entities/managerMapping.entity';
import { QueryAnnualAppraisalDto } from '../dto/annual_appraisal.dto';
import { UsersService } from '../../users/service/user.service';
import { User } from '../../users/entities/user.entity';
import {
  ANNUAL_SUMMARY_EMPTY_MESSAGE,
  PASSWORD_MISMATCH_MESSAGE,
} from '../constants/appraisal.constants';
import {
  QuarterlyReviewStatus,
  RATING_DESCRIPTIONS,
  QuaterlyEnum,
} from '../enums/quarterly_review.enums';

@Injectable()
export class AnnualAppraisalService {
  private readonly logger = new Logger(AnnualAppraisalService.name);

  constructor(
    @InjectRepository(AnnualAppraisalSummary)
    private readonly annualRepo: Repository<AnnualAppraisalSummary>,
    @InjectRepository(QuarterlyReview)
    private readonly reviewRepo: Repository<QuarterlyReview>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeRepo: Repository<EmployeeDetails>,
    @InjectRepository(ManagerMapping)
    private readonly managerMappingRepo: Repository<ManagerMapping>,
    private readonly usersService: UsersService,
  ) {}

  async revealSummary(financialYear: string, password: string, user: User) {
    const typed = password?.trim();
    if (!typed) {
      throw new BadRequestException(PASSWORD_MISMATCH_MESSAGE);
    }
    const account = user?.loginId
      ? await this.usersService.findByLoginId(user.loginId)
      : user?.id
        ? await this.usersService.findById(user.id)
        : null;
    if (!account?.loginId) {
      throw new BadRequestException(PASSWORD_MISMATCH_MESSAGE);
    }
    const userMatches = await this.matchesStoredPassword(typed, account.password);
    const employee = userMatches
      ? null
      : await this.employeeRepo.findOne({
          where: [{ employeeId: account.loginId }, { email: account.loginId }],
        });
    const employeeMatches = userMatches
      ? false
      : await this.matchesStoredPassword(typed, employee?.password);
    if (!userMatches && !employeeMatches) {
      throw new BadRequestException(PASSWORD_MISMATCH_MESSAGE);
    }
    const employeeId = await this.resolveSessionEmployeeId(account.loginId);
    const year = financialYear.trim();
    const record = await this.annualRepo.findOne({
      where: { employeeId, financialYear: year },
    });
    return {
      financialYear: record?.financialYear || year,
      q1Rating: record?.q1Rating ?? null,
      q2Rating: record?.q2Rating ?? null,
      q3Rating: record?.q3Rating ?? null,
      q4Rating: record?.q4Rating ?? null,
      annualAverageRating: record?.annualAverageRating ?? null,
      annualRatingDescription: record?.annualRatingDescription ?? null,
      passwordVerified: true,
    };
  }

  private async matchesStoredPassword(typed: string, stored?: string | null): Promise<boolean> {
    if (!stored) {
      return false;
    }
    if (stored.startsWith('$2')) {
      return this.usersService.comparePassword(typed, stored);
    }
    return stored === typed;
  }

  private async resolveSessionEmployeeId(loginId: string): Promise<string> {
    const byEmployeeId = await this.employeeRepo.findOne({
      where: { employeeId: loginId },
    });
    if (byEmployeeId) {
      return byEmployeeId.employeeId;
    }
    const byEmail = await this.employeeRepo.findOne({
      where: { email: loginId },
    });
    if (byEmail) {
      return byEmail.employeeId;
    }
    return loginId;
  }

  /**
   * Sync and calculate the annual rating for an employee in a financial year
   * Aggregates Q1, Q2, Q3, Q4 scores and computes the overall annual average.
   */
  async syncEmployeeAnnualRating(
    employeeId: string,
    financialYear: string,
  ): Promise<AnnualAppraisalSummary> {
    try {
      this.logger.log(`Syncing annual appraisal for ${employeeId} (${financialYear})`);

      // 1. Fetch all reviews for this employee in this financial year
      const reviews = await this.reviewRepo.find({
        where: { employeeId, financialYear },
      });

      // 2. Map quarter ratings and statuses
      let q1Rating: number | null = null;
      let q1Status: string | null = null;
      let q2Rating: number | null = null;
      let q2Status: string | null = null;
      let q3Rating: number | null = null;
      let q3Status: string | null = null;
      let q4Rating: number | null = null;
      let q4Status: string | null = null;

      const completedRatings: number[] = [];

      for (const r of reviews) {
        const rating = r.finalRating ?? (r.averageScore ? Math.round(Number(r.averageScore)) : null);
        const isReviewed = r.status === QuarterlyReviewStatus.REVIEWED;

        if (r.quarter === QuaterlyEnum.Q1) {
          q1Rating = rating;
          q1Status = r.status;
          if (isReviewed && rating !== null) completedRatings.push(rating);
        } else if (r.quarter === QuaterlyEnum.Q2) {
          q2Rating = rating;
          q2Status = r.status;
          if (isReviewed && rating !== null) completedRatings.push(rating);
        } else if (r.quarter === QuaterlyEnum.Q3) {
          q3Rating = rating;
          q3Status = r.status;
          if (isReviewed && rating !== null) completedRatings.push(rating);
        } else if (r.quarter === QuaterlyEnum.Q4) {
          q4Rating = rating;
          q4Status = r.status;
          if (isReviewed && rating !== null) completedRatings.push(rating);
        }
      }

      // 3. Compute annual average
      let annualAverageRating: number | null = null;
      let finalAnnualRating: number | null = null;
      let annualRatingDescription: string | null = null;

      if (completedRatings.length > 0) {
        const sum = completedRatings.reduce((acc, curr) => acc + curr, 0);
        annualAverageRating = Number((sum / completedRatings.length).toFixed(2));
        finalAnnualRating = Math.round(annualAverageRating);
        annualRatingDescription = RATING_DESCRIPTIONS[finalAnnualRating] || 'Meets Expectations';
      }

      // 4. Fetch employee & manager details
      const emp = await this.employeeRepo.findOne({ where: { employeeId } });
      const mapping = await this.managerMappingRepo.findOne({ where: { employeeId } });

      let record = await this.annualRepo.findOne({
        where: { employeeId, financialYear },
      });

      if (!record) {
        record = this.annualRepo.create({
          employeeId,
          financialYear,
          employeeName: emp?.fullName || reviews[0]?.employeeName || null,
          department: emp?.department || reviews[0]?.department || null,
          designation: emp?.designation || reviews[0]?.designation || null,
          managerId: mapping?.managerId || reviews[0]?.assignerId || null,
          managerName: mapping?.managerName || reviews[0]?.managerName || null,
        });
      }

      // 5. Update data
      record.q1Rating = q1Rating;
      record.q1Status = q1Status;
      record.q2Rating = q2Rating;
      record.q2Status = q2Status;
      record.q3Rating = q3Rating;
      record.q3Status = q3Status;
      record.q4Rating = q4Rating;
      record.q4Status = q4Status;
      record.annualAverageRating = annualAverageRating;
      record.finalAnnualRating = finalAnnualRating;
      record.annualRatingDescription = annualRatingDescription;
      record.completedQuartersCount = completedRatings.length;

      return await this.annualRepo.save(record);
    } catch (error) {
      this.logger.error(`Error syncing annual appraisal: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to sync annual appraisal: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Sync all employees for an entire financial year
   */
  async syncAllForFinancialYear(financialYear: string): Promise<{ syncedCount: number; message: string }> {
    const reviews = await this.reviewRepo
      .createQueryBuilder('r')
      .select('DISTINCT r.employeeId', 'employeeId')
      .where('r.financialYear = :financialYear', { financialYear })
      .getRawMany();

    let count = 0;
    for (const item of reviews) {
      if (item.employeeId) {
        await this.syncEmployeeAnnualRating(item.employeeId, financialYear);
        count++;
      }
    }

    return {
      syncedCount: count,
      message: `Successfully synced annual appraisal ratings for ${count} employees in FY ${financialYear}.`,
    };
  }

  /**
   * Find all annual appraisal records with filters
   */
  async findAll(query?: QueryAnnualAppraisalDto): Promise<{
    data: AnnualAppraisalSummary[];
    total: number;
    page?: number;
    limit?: number;
  }> {
    const qb = this.annualRepo.createQueryBuilder('a');

    if (query?.employeeId?.trim()) {
      qb.andWhere('(a.employeeId = :exactEmp OR a.employeeId LIKE :likeEmp)', {
        exactEmp: query.employeeId.trim(),
        likeEmp: `%${query.employeeId.trim()}%`,
      });
    }

    if (query?.financialYear?.trim()) {
      qb.andWhere('a.financialYear = :fy', { fy: query.financialYear.trim() });
    }

    if (query?.department?.trim()) {
      qb.andWhere('a.department LIKE :dept', { dept: `%${query.department.trim()}%` });
    }

    if (query?.managerId?.trim()) {
      qb.andWhere('a.managerId = :mgr', { mgr: query.managerId.trim() });
    }

    if (query?.rating) {
      qb.andWhere('a.finalAnnualRating = :rating', { rating: query.rating });
    }

    if (query?.q?.trim()) {
      const keyword = `%${query.q.trim()}%`;
      qb.andWhere(
        '(a.employeeId LIKE :keyword OR a.employeeName LIKE :keyword OR a.department LIKE :keyword OR a.financialYear LIKE :keyword)',
        { keyword },
      );
    }

    qb.orderBy('a.id', 'DESC');

    const total = await qb.getCount();

    if (query?.page && query?.limit) {
      const skip = (query.page - 1) * query.limit;
      qb.skip(skip).take(query.limit);
    }

    const data = await qb.getMany();
    return {
      data,
      total,
      page: query?.page,
      limit: query?.limit,
    };
  }

  /**
   * Get all annual summaries for a specific employee across years
   */
  async findByEmployee(employeeId: string): Promise<AnnualAppraisalSummary[]> {
    return await this.annualRepo.find({
      where: { employeeId },
      order: { financialYear: 'DESC' },
    });
  }

  /**
   * Get a specific employee's summary for a specific financial year
   */
  async findOne(employeeId: string, financialYear: string): Promise<AnnualAppraisalSummary> {
    const record = await this.annualRepo.findOne({
      where: { employeeId, financialYear },
    });

    if (!record) {
      // Auto-sync if not present yet
      return await this.syncEmployeeAnnualRating(employeeId, financialYear);
    }

    return record;
  }
}
