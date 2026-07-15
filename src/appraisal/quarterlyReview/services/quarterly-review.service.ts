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
  ) {}

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

  async findAllForEmployee(employeeId: string): Promise<QuarterlyReview[]> {
    this.logger.log(`Fetching all quarterly reviews for employee: ${employeeId}`);
    try {
      return await this.quarterlyReviewRepository.find({
        where: { employeeId },
        order: { quarter: 'DESC' },
      });
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
    this.logger.log(`Fetching quarterly review for employee: ${employeeId}, quarter: ${quarter}`);
    try {
      return await this.quarterlyReviewRepository.findOne({
        where: { employeeId, quarter },
      });
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
    const { quarter, status, overview, achievements, challenges, learningGoals } = dto;
    this.logger.log(`Saving/submitting quarterly review for employee: ${employeeId}, quarter: ${quarter}, status: ${status}`);

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
        where: { employeeId, quarter },
      });

      if (review) {
        if (review.status === ReviewStatus.SUBMITTED) {
          throw new BadRequestException(`Quarterly review for ${quarter} has already been submitted and cannot be modified.`);
        }

        // Update existing draft
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
          quarter,
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

      return await this.quarterlyReviewRepository.save(review);
    } catch (error) {
      this.logger.error(`Error saving/submitting quarterly review for employee ${employeeId}, quarter ${quarter}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to save/submit quarterly review: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

