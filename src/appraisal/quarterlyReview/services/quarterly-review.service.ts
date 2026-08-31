import { Injectable, BadRequestException, Logger, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { QuarterlyReview } from '../entities/quarterly-review.entity';
import { CreateQuarterlyReviewDto } from '../dto/create-quarterly-review.dto';
import { ReviewStatus } from '../enums/quarterly-review.enum';
import { ManagerMapping, ManagerMappingStatus } from '../../../managerMapping/entities/managerMapping.entity';
import { DocumentUploaderService } from '../../../common/document-uploader/services/document-uploader.service';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../../../common/document-uploader/models/documentmetainfo.model';

@Injectable()
export class QuarterlyReviewService implements OnModuleInit {
  private readonly logger = new Logger(QuarterlyReviewService.name);

  constructor(
    @InjectRepository(QuarterlyReview)
    private readonly quarterlyReviewRepository: Repository<QuarterlyReview>,
    private readonly documentUploaderService: DocumentUploaderService,
  ) { }


  async onModuleInit() {
    try {
      await this.quarterlyReviewRepository.query(
        `ALTER TABLE object_store MODIFY COLUMN refType VARCHAR(255) NOT NULL`
      ).catch(() => {});
      await this.quarterlyReviewRepository.query(
        `ALTER TABLE object_store MODIFY COLUMN entityType VARCHAR(255) NOT NULL`
      ).catch(() => {});

      const columns: Array<{ COLUMN_NAME: string }> = await this.quarterlyReviewRepository.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'quarterly_reviews'`
      );
      const existingCols = new Set(columns.map(c => c.COLUMN_NAME.toLowerCase()));

      if (!existingCols.has('projects')) {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN projects JSON NULL AFTER overview`);
        this.logger.log('[DB Migration] Added projects column to quarterly_reviews.');
      }
      if (!existingCols.has('self_rating')) {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN self_rating JSON NULL AFTER learning_goals`);
        this.logger.log('[DB Migration] Added self_rating column to quarterly_reviews.');
      }
      if (!existingCols.has('average_rating')) {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN average_rating DECIMAL(3,1) NULL AFTER self_rating`);
        this.logger.log('[DB Migration] Added average_rating column to quarterly_reviews.');
      }
      if (!existingCols.has('company_environment')) {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN company_environment JSON NULL AFTER average_rating`);
        this.logger.log('[DB Migration] Added company_environment column to quarterly_reviews.');
      }
      if (existingCols.has('achievements')) {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews DROP COLUMN achievements`);
        this.logger.log('[DB Migration] Dropped achievements column from quarterly_reviews.');
      }
      if (existingCols.has('challenges')) {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews DROP COLUMN challenges`);
        this.logger.log('[DB Migration] Dropped challenges column from quarterly_reviews.');
      }
    } catch (err: any) {
      this.logger.warn(`[DB Migration] Schema check skipped: ${err.message}`);
    }
  }

  getCurrentQuarter(): string {
    const now = new Date();
    const month = now.getMonth();
    const calendarYear = now.getFullYear();

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
      quarter = 4;
      fyStartYear = calendarYear - 1;
    }

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
    if (/^Q\d-FY\d{4}-\d{2}$/i.test(trimmed)) {
      return trimmed.replace(/^(Q\d)-(FY\d{4}-\d{2})$/i, '$1 $2');
    }
    return trimmed;
  }

  private sanitizeReview(review: QuarterlyReview | null): any | null {
    if (!review) return null;

    let projects = this.parseJsonIfNeeded(review.projects);
    const rawAchievements = this.parseJsonIfNeeded((review as any).achievements);
    const rawChallenges = this.parseJsonIfNeeded((review as any).challenges);

    // Fallback: synthesize projects from legacy columns if projects is empty
    if (!projects || (Array.isArray(projects) && projects.length === 0)) {
      if (Array.isArray(rawAchievements) && rawAchievements.length > 0) {
        const challengesList: any[] = Array.isArray(rawChallenges) ? rawChallenges : [];
        projects = rawAchievements.map((ach: any) => {
          const title = ach.title || '';
          const matching = challengesList.find((ch: any) => (ch.title || '').trim() === title.trim());
          return {
            projectTitle: title,
            achievement: ach.details || '',
            challenge: matching?.details || '',
            attachment: null,
          };
        });
      }
    }

    const teamContrib = this.parseJsonIfNeeded(review.teamContribution);
    const companyEnv = this.parseJsonIfNeeded(review.companyEnvironment);
    const avgRating = review.averageRating !== null && review.averageRating !== undefined
      ? parseFloat(String(review.averageRating))
      : null;

    return {
      createdAt: (review as any).createdAt,
      updatedAt: (review as any).updatedAt,
      createdBy: (review as any).createdBy,
      updatedBy: (review as any).updatedBy,
      id: review.id,
      employeeId: review.employeeId,
      quarter: review.quarter,
      status: review.status,
      overview: review.overview,
      projects: projects ?? [],
      learningGoals: this.parseJsonIfNeeded(review.learningGoals) ?? [],
      teamContribution: Array.isArray(teamContrib) ? teamContrib : [],
      averageRating: avgRating,
      companyEnvironment: companyEnv ?? null,
      submittedDate: review.submittedDate,
      managerName: review.managerName,
    };
  }

  async findAllForEmployee(employeeId: string, financialYear?: string): Promise<any[]> {
    this.logger.log(`Fetching all quarterly reviews for employee: ${employeeId}${financialYear ? ` | FY filter: ${financialYear}` : ''}`);
    try {
      const whereClause: any = financialYear
        ? { employeeId, quarter: Like(`%${financialYear}%`) }
        : { employeeId };

      let reviews: QuarterlyReview[];
      try {
        reviews = await this.quarterlyReviewRepository.find({
          where: whereClause,
          order: { quarter: 'DESC' },
        });
      } catch (dbErr: any) {
        if (dbErr.message?.includes('projects') || dbErr.message?.includes('self_rating') || dbErr.message?.includes('company_environment') || dbErr.code === 'ER_BAD_FIELD_ERROR') {
          try {
            await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN projects JSON NULL, ADD COLUMN self_rating JSON NULL, ADD COLUMN average_rating DECIMAL(3,1) NULL, ADD COLUMN company_environment JSON NULL`);
            reviews = await this.quarterlyReviewRepository.find({
              where: whereClause,
              order: { quarter: 'DESC' },
            });
          } catch {
            reviews = [];
          }
        } else {
          throw dbErr;
        }
      }

      return reviews.map((r) => this.sanitizeReview(r));
    } catch (error) {
      this.logger.error(`Error fetching quarterly reviews for employee ${employeeId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch quarterly reviews: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOneByQuarter(employeeId: string, quarter: string): Promise<any | null> {
    const canonicalQuarter = this.normalizeQuarter(quarter);
    this.logger.log(`[findOneByQuarter] employeeId='${employeeId}' | raw quarter='${quarter}' | canonical='${canonicalQuarter}'`);
    try {
      let review: QuarterlyReview | null = null;
      try {
        review = await this.quarterlyReviewRepository.findOne({
          where: [
            { employeeId, quarter: canonicalQuarter },
            { employeeId, quarter: quarter.trim() },
          ],
        });
      } catch (dbErr: any) {
        if (dbErr.message?.includes('projects') || dbErr.message?.includes('self_rating') || dbErr.message?.includes('company_environment') || dbErr.code === 'ER_BAD_FIELD_ERROR') {
          try {
            await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN projects JSON NULL, ADD COLUMN self_rating JSON NULL, ADD COLUMN average_rating DECIMAL(3,1) NULL, ADD COLUMN company_environment JSON NULL`);
            review = await this.quarterlyReviewRepository.findOne({
              where: [
                { employeeId, quarter: canonicalQuarter },
                { employeeId, quarter: quarter.trim() },
              ],
            });
          } catch {
            review = null;
          }
        } else {
          throw dbErr;
        }
      }
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

  async saveOrSubmit(employeeId: string, dto: CreateQuarterlyReviewDto, username: string): Promise<any> {
    const canonicalQuarter = this.normalizeQuarter(dto.quarter);
    const { status, overview, projects, learningGoals, teamContribution, averageRating, companyEnvironment } = dto;
    this.logger.log(`[saveOrSubmit] employeeId='${employeeId}' | quarter='${canonicalQuarter}' | status='${status}'`);

    try {
      try {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN self_rating JSON NULL, ADD COLUMN average_rating DECIMAL(3,1) NULL, ADD COLUMN company_environment JSON NULL`);
      } catch { }

      const managerMapping = await this.quarterlyReviewRepository.manager
        .getRepository(ManagerMapping)
        .findOne({
          where: { employeeId, status: ManagerMappingStatus.ACTIVE },
        });

      const activeManagerName = managerMapping ? managerMapping.managerName : null;

      if (status === ReviewStatus.SUBMITTED && !activeManagerName) {
        throw new BadRequestException('No active manager assigned to employee. Cannot submit review.');
      }

      // Calculate average rating if teamContribution array is present and averageRating was not provided
      let computedAvg: number | null = averageRating ?? null;
      if (Array.isArray(teamContribution) && teamContribution.length > 0) {
        const validRatings = teamContribution.map(t => Number(t.rating) || 0).filter(r => r > 0);
        if (validRatings.length > 0) {
          const sum = validRatings.reduce((a, b) => a + b, 0);
          computedAvg = Math.round((sum / validRatings.length) * 10) / 10;
        }
      }

      const existing = await this.quarterlyReviewRepository.findOne({
        where: [
          { employeeId, quarter: canonicalQuarter },
          { employeeId, quarter: dto.quarter },
        ],
      });

      let review: QuarterlyReview;

      if (existing) {
        if (existing.status === ReviewStatus.SUBMITTED) {
          throw new BadRequestException(`Quarterly review for ${canonicalQuarter} has already been submitted and cannot be modified.`);
        }

        existing.quarter = canonicalQuarter;
        existing.overview = overview ?? existing.overview;
        existing.projects = projects ?? existing.projects;
        existing.learningGoals = learningGoals ?? existing.learningGoals;
        existing.teamContribution = teamContribution ?? existing.teamContribution;
        existing.averageRating = computedAvg ?? existing.averageRating;
        existing.companyEnvironment = companyEnvironment ?? existing.companyEnvironment;
        existing.status = status;
        (existing as any).updatedBy = username;
        existing.managerName = activeManagerName;

        if (status === ReviewStatus.SUBMITTED) {
          existing.submittedDate = new Date();
        }

        review = existing;
      } else {
        review = this.quarterlyReviewRepository.create({
          employeeId,
          quarter: canonicalQuarter,
          status,
          overview,
          projects,
          learningGoals,
          teamContribution,
          averageRating: computedAvg,
          companyEnvironment,
          createdBy: username,
          updatedBy: username,
          managerName: activeManagerName,
          submittedDate: status === ReviewStatus.SUBMITTED ? new Date() : null,
        } as any) as unknown as QuarterlyReview;
      }

      const saved = await this.quarterlyReviewRepository.save(review as any) as QuarterlyReview;
      return this.sanitizeReview(saved);
    } catch (error) {
      this.logger.error(`Error saving/submitting quarterly review for employee ${employeeId}, quarter ${canonicalQuarter}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to save/submit quarterly review: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async uploadDocument(
    documents: Express.Multer.File[],
    refType: ReferenceType,
    refId: number,
    entityType: EntityType,
    entityId: number,
  ) {
    this.logger.log(
      `[DOCS] Uploading ${documents.length} document(s) for quarterly review entityId=${entityId}, refId=${refId}`,
    );
    try {
      const uploadPromises = documents.map(async (doc) => {
        const details = new DocumentMetaInfo();
        details.refId = refId;
        details.refType = refType;
        details.entityId = entityId;
        details.entityType = entityType;

        return await this.documentUploaderService.uploadImage(doc, details);
      });

      const results = await Promise.all(uploadPromises);
      return {
        success: true,
        message: 'Documents uploaded successfully',
        data: results,
      };
    } catch (error) {
      this.logger.error(`[DOCS] Upload failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Error uploading documents',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAllFiles(
    entityType: EntityType,
    entityId: number,
    refId: number,
    referenceType: ReferenceType,
  ) {
    try {
      return await this.documentUploaderService.getAllDocs(
        entityType,
        entityId,
        referenceType,
        refId,
      );
    } catch (error) {
      this.logger.error(`[DOCS] Failed to get files: ${error.message}`);
      throw new HttpException(
        'Failed to fetch documents',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteDocument(
    entityType: EntityType,
    entityId: number,
    refId: number,
    key: string,
  ) {
    try {
      await this.documentUploaderService.deleteDoc(key);
      return {
        success: true,
        message: 'Document deleted successfully',
      };
    } catch (error) {
      this.logger.error(`[DOCS] Delete failed: ${error.message}`, error.stack);
      throw new HttpException(
        'Error deleting document',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

