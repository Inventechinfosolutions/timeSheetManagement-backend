import { Injectable, BadRequestException, NotFoundException, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuarterlyReview } from '../entities/quarterly-review.entity';
import { CreateQuarterlyReviewDto } from '../dto/create-quarterly-review.dto';
import { UpdateQuarterlyReviewDto } from '../dto/update-quarterly-review.dto';
import { ReviewStatus } from '../enums/quarterly-review.enum';
import { ManagerMapping, ManagerMappingStatus } from '../../../managerMapping/entities/managerMapping.entity';

@Injectable()
export class QuarterlyReviewService {
  private readonly logger = new Logger(QuarterlyReviewService.name);

  constructor(
    @InjectRepository(QuarterlyReview)
    private readonly quarterlyReviewRepository: Repository<QuarterlyReview>,
  ) { }

  getCurrentQuarter(): string {
    const now = new Date();
    const month = now.getMonth(); // 0 = Jan, 3 = Apr, 6 = Jul, 9 = Oct
    const calendarYear = now.getFullYear();

    // India Financial Year: April (month 3) to March (month 2)
    // FY year is the year in which April falls
    // Q1: Apr–Jun (months 3,4,5), Q2: Jul–Sep (6,7,8), Q3: Oct–Dec (9,10,11), Q4: Jan–Mar (0,1,2)
    let quarter: number;
    let fyStartYear: number;

    if (month >= 3 && month <= 5) {
      quarter = 1;
      fyStartYear = calendarYear;
    } else if (month >= 6 && month <= 8) {
      quarter = 2;
      fyStartYear = calendarYear;
    } else if (month >= 9 && month <= 11) {
      quarter = 3;
      fyStartYear = calendarYear;
    } else {
      // Jan, Feb, Mar — belongs to previous financial year's Q4
      quarter = 4;
      fyStartYear = calendarYear - 1;
    }

    // e.g. "Q2 FY2026-27"
    return `Q${quarter} FY${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;
  }

  private parseJsonIfNeeded(val: any): any {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return val;
  }

  private normalizeQuarter(q: string): string {
    if (!q) return '';
    const trimmed = q.trim();
    // Convert slug format "Q2-FY2026-27" → "Q2 FY2026-27"
    if (/^Q\d-FY\d{4}-\d{2}$/i.test(trimmed)) {
      return trimmed.replace(/^(Q\d)-(FY\d{4}-\d{2})$/i, '$1 $2');
    }
    return trimmed;
  }

  private sanitizeReview(review: QuarterlyReview | null): QuarterlyReview | null {
    if (!review) return null;
    review.achievements = this.parseJsonIfNeeded(review.achievements);
    review.challenges = this.parseJsonIfNeeded(review.challenges);
    review.learningGoals = this.parseJsonIfNeeded(review.learningGoals);
    return review;
  }

  async findAllForEmployee(employeeId: string): Promise<QuarterlyReview[]> {
    this.logger.log(`Fetching all quarterly reviews for employee: ${employeeId}`);
    try {
      const reviews = await this.quarterlyReviewRepository.find({
        where: { employeeId },
        order: { quarter: 'DESC' },
      });
      return reviews.map((r) => this.sanitizeReview(r)!);
    } catch (error) {
      this.logger.error(`Error fetching quarterly reviews for employee ${employeeId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch quarterly reviews: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOneByQuarter(employeeId: string, quarter: string): Promise<QuarterlyReview | null> {
    const canonicalQuarter = this.normalizeQuarter(quarter);
    this.logger.log(`[findOneByQuarter] employeeId='${employeeId}' | raw quarter='${quarter}' | canonical='${canonicalQuarter}'`);
    try {
      const review = await this.quarterlyReviewRepository.findOne({
        where: [
          { employeeId, quarter: canonicalQuarter },
          { employeeId, quarter: quarter.trim() },
        ],
      });
      this.logger.log(`[findOneByQuarter] Found: ${review ? `id=${review.id}, quarter='${review.quarter}'` : 'null'}`);
      return this.sanitizeReview(review);
    } catch (error) {
      this.logger.error(`Error fetching quarterly review for employee ${employeeId}, quarter ${quarter}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch quarterly review: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async saveOrSubmit(employeeId: string, dto: CreateQuarterlyReviewDto, username: string): Promise<QuarterlyReview> {
    const canonicalQuarter = this.normalizeQuarter(dto.quarter);
    const { status, overview, achievements, challenges, learningGoals } = dto;
    this.logger.log(`[saveOrSubmit] employeeId='${employeeId}' | raw quarter='${dto.quarter}' | canonical='${canonicalQuarter}' | status='${status}'`);

    try {
      // Fetch active manager mapping for the employee
      const managerMapping = await this.quarterlyReviewRepository.manager
        .getRepository(ManagerMapping)
        .findOne({
          where: { employeeId, status: ManagerMappingStatus.ACTIVE },
        });

      const activeManagerName = managerMapping ? managerMapping.managerName : null;

      // Validate manager assignment for submission
      if (status === ReviewStatus.SUBMITTED && !activeManagerName) {
        throw new BadRequestException('No active manager assigned to employee. Cannot submit review.');
      }

      let review = await this.quarterlyReviewRepository.findOne({
        where: [
          { employeeId, quarter: canonicalQuarter },
          { employeeId, quarter: dto.quarter },
        ],
      });

      if (review) {
        if (review.status === ReviewStatus.SUBMITTED) {
          throw new BadRequestException(`Quarterly review for ${canonicalQuarter} has already been submitted and cannot be modified.`);
        }

        // Update existing draft
        review.quarter = canonicalQuarter;
        review.overview = overview ?? review.overview;
        review.achievements = achievements ?? review.achievements;
        review.challenges = challenges ?? review.challenges;
        review.learningGoals = learningGoals ?? review.learningGoals;
        review.status = status;
        review.updatedBy = username;
        review.managerName = activeManagerName;

        if (status === ReviewStatus.SUBMITTED) {
          review.submittedDate = new Date();
        }
      } else {
        // Create new review
        review = this.quarterlyReviewRepository.create({
          employeeId,
          quarter: canonicalQuarter,
          status,
          overview,
          achievements,
          challenges,
          learningGoals,
          createdBy: username,
          updatedBy: username,
          managerName: activeManagerName,
          submittedDate: status === ReviewStatus.SUBMITTED ? new Date() : null,
        });
      }

      const saved = await this.quarterlyReviewRepository.save(review);
      return this.sanitizeReview(saved)!;
    } catch (error) {
      this.logger.error(`Error saving/submitting quarterly review for employee ${employeeId}, quarter ${canonicalQuarter}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to save/submit quarterly review: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

}

