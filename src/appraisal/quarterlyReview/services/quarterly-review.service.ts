import PDFDocument from 'pdfkit';
import { EmployeeDetails } from '../../../employeeTimeSheet/entities/employeeDetails.entity';
﻿import { Injectable, BadRequestException, Logger, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
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
      if (!existingCols.has('review_status')) {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN review_status VARCHAR(50) NULL`);
        this.logger.log('[DB Migration] Added review_status column to quarterly_reviews.');
      }
      if (!existingCols.has('final_rating')) {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN final_rating VARCHAR(100) NULL`);
        this.logger.log('[DB Migration] Added final_rating column to quarterly_reviews.');
      }
      if (!existingCols.has('reviewed_on')) {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN reviewed_on TIMESTAMP NULL`);
        this.logger.log('[DB Migration] Added reviewed_on column to quarterly_reviews.');
      }
      if (!existingCols.has('ratings')) {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN ratings JSON NULL`);
        this.logger.log('[DB Migration] Added ratings column to quarterly_reviews.');
      }
      if (!existingCols.has('strengths')) {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN strengths TEXT NULL`);
        this.logger.log('[DB Migration] Added strengths column to quarterly_reviews.');
      }
      if (!existingCols.has('improvements')) {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN improvements TEXT NULL`);
        this.logger.log('[DB Migration] Added improvements column to quarterly_reviews.');
      }
      if (!existingCols.has('remarks')) {
        await this.quarterlyReviewRepository.query(`ALTER TABLE quarterly_reviews ADD COLUMN remarks TEXT NULL`);
        this.logger.log('[DB Migration] Added remarks column to quarterly_reviews.');
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
      reviewStatus: review.reviewStatus ?? null,
      finalRating: review.finalRating ?? null,
      reviewedOn: review.reviewedOn ?? null,
      ratings: this.parseJsonIfNeeded(review.ratings) ?? null,
      strengths: review.strengths ?? null,
      improvements: review.improvements ?? null,
      remarks: review.remarks ?? null,
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


  async deleteOrWithdraw(employeeId: string, idOrQuarter: number | string): Promise<{ success: boolean; message: string; data?: any }> {
    let review: QuarterlyReview | null = null;
    const isNum = typeof idOrQuarter === 'number' || (!isNaN(Number(idOrQuarter)) && !String(idOrQuarter).toLowerCase().startsWith('q'));
    if (isNum) {
      review = await this.quarterlyReviewRepository.findOne({ where: { id: Number(idOrQuarter), employeeId } });
    } else {
      const canonicalQuarter = this.normalizeQuarter(String(idOrQuarter));
      review = await this.quarterlyReviewRepository.findOne({
        where: [
          { employeeId, quarter: canonicalQuarter },
          { employeeId, quarter: String(idOrQuarter).trim() },
        ],
      });
    }

    if (!review) {
      throw new HttpException('Quarterly review not found or access denied', HttpStatus.NOT_FOUND);
    }
    if (
      review.reviewStatus === 'Reviewed' ||
      review.reviewStatus === 'Completed' ||
      review.status === ReviewStatus.APPROVED ||
      review.reviewStatus === ReviewStatus.COMPLETED
    ) {
      throw new HttpException('Cannot withdraw a review that has already been reviewed or completed by the manager', HttpStatus.BAD_REQUEST);
    }

    await this.quarterlyReviewRepository.delete({ id: review.id, employeeId });
    this.logger.log(`[Review] Employee ${employeeId} withdrew review id=${review.id} (${review.quarter})`);
    return {
      success: true,
      message: `Quarterly review for ${review.quarter} withdrawn successfully`,
      data: { id: review.id, quarter: review.quarter },
    };
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


  async generateQuarterlyReviewPdf(
    employeeId: string,
    idOrQuarter: number | string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    this.logger.log(`[PDF] Generating Quarterly Review PDF for ${employeeId}, id/quarter='${idOrQuarter}'`);

    let review: QuarterlyReview | null = null;
    const isNum = typeof idOrQuarter === 'number' || (!isNaN(Number(idOrQuarter)) && !String(idOrQuarter).toLowerCase().startsWith('q'));
    if (isNum) {
      review = await this.quarterlyReviewRepository.findOne({ where: { id: Number(idOrQuarter) } });
    }
    if (!review) {
      const canonicalQuarter = this.normalizeQuarter(String(idOrQuarter));
      review = await this.quarterlyReviewRepository.findOne({
        where: [
          { employeeId, quarter: canonicalQuarter },
          { employeeId, quarter: String(idOrQuarter).trim() },
        ],
      });
    }

    if (!review) {
      throw new HttpException('Quarterly review not found', HttpStatus.NOT_FOUND);
    }

    let employee: EmployeeDetails | null = null;
    try {
      const empRepo = this.quarterlyReviewRepository.manager.getRepository(EmployeeDetails);
      employee = await empRepo.findOne({ where: { employeeId: review.employeeId } });
    } catch (err: any) {
      this.logger.warn(`[PDF] Could not fetch employee details for ${review.employeeId}: ${err.message}`);
    }

    const sanitized = this.sanitizeReview(review);
    const empName = employee?.fullName || review.employeeId;
    const empDept = employee?.department || 'N/A';
    const empDesig = employee?.designation || 'N/A';
    const quarterName = review.quarter;
    const sanitizedQuarter = quarterName.replace(/[\s\/\\:]+/g, '_');
    const filename = `Quarterly_Review_${sanitizedQuarter}_${review.employeeId}.pdf`;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 40,
          size: 'A4',
          bufferPages: true,
          autoFirstPage: true,
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => {
          this.logger.log(`[PDF] PDF generation completed for ${filename}`);
          resolve({ buffer: Buffer.concat(buffers), filename });
        });
        doc.on('error', (err) => {
          this.logger.error(`[PDF] Stream error during PDF generation: ${err.message}`, err.stack);
          reject(err);
        });

        const primaryBlue = '#1E3A8A';
        const primaryIndigo = '#4338CA';
        const darkText = '#1E293B';
        const mutedText = '#64748B';
        const lightBg = '#F8FAFC';
        const borderColor = '#E2E8F0';
        const emeraldGreen = '#059669';

        const pageWidth = doc.page.width; // 595.28 pt for A4
        const contentWidth = pageWidth - 80;

        // --- HEADER BANNER ---
        doc.rect(0, 0, pageWidth, 80).fill(primaryBlue);

        doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold').text('WORKSPHERE', 40, 24);
        doc.fontSize(9).font('Helvetica').text('PERFORMANCE MANAGEMENT SYSTEM', 40, 46);

        doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold').text('QUARTERLY PERFORMANCE REVIEW', 250, 24, {
          align: 'right',
          width: contentWidth - 210,
        });
        doc.fontSize(10).font('Helvetica-Bold').text(quarterName.toUpperCase(), 250, 44, {
          align: 'right',
          width: contentWidth - 210,
        });

        doc.y = 95;

        // --- EMPLOYEE & REVIEW INFO BOX ---
        const infoBoxY = doc.y;
        doc.roundedRect(40, infoBoxY, contentWidth, 76, 6).fillAndStroke(lightBg, borderColor);

        // Left Column: Employee Info
        doc.fillColor(mutedText).fontSize(8).font('Helvetica-Bold').text('EMPLOYEE NAME', 55, infoBoxY + 10);
        doc.fillColor(darkText).fontSize(10).font('Helvetica-Bold').text(empName, 55, infoBoxY + 22);

        doc.fillColor(mutedText).fontSize(8).font('Helvetica-Bold').text('EMPLOYEE ID', 55, infoBoxY + 44);
        doc.fillColor(darkText).fontSize(9).font('Helvetica').text(review.employeeId, 55, infoBoxY + 56);

        doc.fillColor(mutedText).fontSize(8).font('Helvetica-Bold').text('DESIGNATION & DEPT', 180, infoBoxY + 10);
        doc.fillColor(darkText).fontSize(9).font('Helvetica').text(`${empDesig} • ${empDept}`, 180, infoBoxY + 22, { width: 140 });

        doc.fillColor(mutedText).fontSize(8).font('Helvetica-Bold').text('REVIEWING MANAGER', 180, infoBoxY + 44);
        doc.fillColor(darkText).fontSize(9).font('Helvetica').text(review.managerName || '—', 180, infoBoxY + 56, { width: 140 });

        // Right Column: Status & Rating Highlight
        const statusLabel = review.reviewStatus || review.status || 'Submitted';
        const ratingVal = sanitized.finalRating ? String(sanitized.finalRating) : (sanitized.averageRating ? String(sanitized.averageRating) : '—');

        doc.fillColor(mutedText).fontSize(8).font('Helvetica-Bold').text('SUBMISSION STATUS', 340, infoBoxY + 10);
        doc.fillColor(emeraldGreen).fontSize(10).font('Helvetica-Bold').text(statusLabel.toUpperCase(), 340, infoBoxY + 22);

        doc.fillColor(mutedText).fontSize(8).font('Helvetica-Bold').text('SUBMITTED DATE', 340, infoBoxY + 44);
        doc.fillColor(darkText).fontSize(9).font('Helvetica').text(
          review.submittedDate ? new Date(review.submittedDate).toLocaleDateString('en-IN') : '—',
          340,
          infoBoxY + 56
        );

        // Rating badge on far right
        doc.roundedRect(440, infoBoxY + 10, 100, 56, 6).fillAndStroke('#EEF2FF', '#C7D2FE');
        doc.fillColor(primaryIndigo).fontSize(7).font('Helvetica-Bold').text('FINAL RATING', 445, infoBoxY + 18, { align: 'center', width: 90 });
        doc.fillColor(primaryIndigo).fontSize(16).font('Helvetica-Bold').text(ratingVal, 445, infoBoxY + 30, { align: 'center', width: 90 });

        doc.y = infoBoxY + 90;

        // Helper to check page break
        const checkPageBreak = (neededHeight: number) => {
          if (doc.y + neededHeight > doc.page.height - 50) {
            doc.addPage();
            doc.y = 45;
          }
        };

        // Section Title Helper
        const renderSectionHeader = (title: string, iconNumber: string) => {
          checkPageBreak(35);
          doc.moveDown(0.5);
          const currY = doc.y;
          doc.roundedRect(40, currY, contentWidth, 22, 4).fill(primaryIndigo);
          doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold').text(`${iconNumber}. ${title.toUpperCase()}`, 50, currY + 6);
          doc.y = currY + 28;
        };

        // --- SECTION 1: OVERVIEW ---
        renderSectionHeader('Quarterly Overview & Summary', '1');
        checkPageBreak(40);
        doc.fillColor(darkText).fontSize(9).font('Helvetica').text(
          sanitized.overview || 'No overview summary provided.',
          45,
          doc.y,
          { width: contentWidth - 10, lineGap: 3 }
        );
        doc.moveDown(0.8);

        // --- SECTION 2: PROJECTS & ACHIEVEMENTS ---
        renderSectionHeader('Projects, Key Achievements & Challenges', '2');
        const projectsList = Array.isArray(sanitized.projects) ? sanitized.projects : [];
        if (projectsList.length === 0) {
          checkPageBreak(25);
          doc.fillColor(mutedText).fontSize(9).font('Helvetica-Oblique').text('No project achievements recorded for this quarter.', 45, doc.y);
          doc.moveDown(0.8);
        } else {
          projectsList.forEach((proj: any, idx: number) => {
            checkPageBreak(70);
            const projTitle = proj.projectTitle || `Project #${idx + 1}`;
            const achievement = proj.achievement || '—';
            const challenge = proj.challenge || '—';

            const blockY = doc.y;
            doc.roundedRect(40, blockY, contentWidth, 18, 3).fill('#F1F5F9');
            doc.fillColor(primaryBlue).fontSize(9).font('Helvetica-Bold').text(`Project ${idx + 1}: ${projTitle}`, 48, blockY + 5);
            doc.y = blockY + 22;

            doc.fillColor(mutedText).fontSize(8).font('Helvetica-Bold').text('Key Achievement:', 48, doc.y);
            doc.fillColor(darkText).fontSize(8.5).font('Helvetica').text(achievement, 135, doc.y, { width: contentWidth - 145, lineGap: 2 });
            doc.moveDown(0.3);

            doc.fillColor(mutedText).fontSize(8).font('Helvetica-Bold').text('Challenges / Solutions:', 48, doc.y);
            doc.fillColor(darkText).fontSize(8.5).font('Helvetica').text(challenge, 135, doc.y, { width: contentWidth - 145, lineGap: 2 });
            doc.moveDown(0.6);
          });
        }

        // --- SECTION 3: LEARNING GOALS ---
        renderSectionHeader('Learning & Professional Development Goals', '3');
        const goals = Array.isArray(sanitized.learningGoals) ? sanitized.learningGoals : [];
        if (goals.length === 0) {
          checkPageBreak(25);
          doc.fillColor(mutedText).fontSize(9).font('Helvetica-Oblique').text('No learning goals recorded for this quarter.', 45, doc.y);
          doc.moveDown(0.8);
        } else {
          goals.forEach((goal: any, idx: number) => {
            checkPageBreak(35);
            const title = typeof goal === 'string' ? goal : (goal.title || goal.details || `Goal #${idx + 1}`);
            const details = typeof goal === 'object' && goal.details && goal.title ? goal.details : '';
            doc.fillColor(primaryIndigo).fontSize(9).font('Helvetica-Bold').text(`• ${title}`, 48, doc.y);
            if (details) {
              doc.fillColor(darkText).fontSize(8.5).font('Helvetica').text(details, 60, doc.y + 2, { width: contentWidth - 70, lineGap: 2 });
            }
            doc.moveDown(0.4);
          });
          doc.moveDown(0.4);
        }

        // --- SECTION 4: TEAM CONTRIBUTION ---
        renderSectionHeader('Core Values & Team Contributions', '4');
        const teamContrib = Array.isArray(sanitized.teamContribution) ? sanitized.teamContribution : [];
        if (teamContrib.length === 0) {
          checkPageBreak(25);
          doc.fillColor(mutedText).fontSize(9).font('Helvetica-Oblique').text('No team contribution ratings provided.', 45, doc.y);
          doc.moveDown(0.8);
        } else {
          checkPageBreak(teamContrib.length * 16 + 20);
          teamContrib.forEach((item: any) => {
            const cat = item.category || 'Competency';
            const r = item.rating != null ? `${item.rating} / 5` : '—';
            doc.fillColor(darkText).fontSize(8.5).font('Helvetica-Bold').text(cat, 48, doc.y, { width: 320 });
            doc.fillColor(primaryIndigo).fontSize(8.5).font('Helvetica-Bold').text(r, 400, doc.y - 10, { width: 100, align: 'right' });
            doc.strokeColor(borderColor).lineWidth(0.5).moveTo(48, doc.y + 2).lineTo(500, doc.y + 2).stroke();
            doc.moveDown(0.5);
          });
          doc.moveDown(0.5);
        }

        // --- SECTION 5: COMPANY ENVIRONMENT FEEDBACK ---
        if (sanitized.companyEnvironment) {
          renderSectionHeader('Company Environment & Work Culture Feedback', '5');
          const env = sanitized.companyEnvironment;
          checkPageBreak(60);
          if (env.workCultureFeedback) {
            doc.fillColor(mutedText).fontSize(8).font('Helvetica-Bold').text('Work Culture Feedback:', 48, doc.y);
            doc.fillColor(darkText).fontSize(8.5).font('Helvetica').text(env.workCultureFeedback, 48, doc.y + 2, { width: contentWidth - 20 });
            doc.moveDown(0.4);
          }
          if (env.workLifeBalance) {
            doc.fillColor(mutedText).fontSize(8).font('Helvetica-Bold').text('Work-Life Balance:', 48, doc.y);
            doc.fillColor(darkText).fontSize(8.5).font('Helvetica').text(env.workLifeBalance, 48, doc.y + 2, { width: contentWidth - 20 });
            doc.moveDown(0.4);
          }
          if (env.suggestions) {
            doc.fillColor(mutedText).fontSize(8).font('Helvetica-Bold').text('Suggestions for Improvement:', 48, doc.y);
            doc.fillColor(darkText).fontSize(8.5).font('Helvetica').text(env.suggestions, 48, doc.y + 2, { width: contentWidth - 20 });
            doc.moveDown(0.4);
          }
        }

        // --- SECTION 6: MANAGER EVALUATION & FEEDBACK ---
        if (sanitized.strengths || sanitized.improvements || sanitized.remarks || sanitized.ratings) {
          renderSectionHeader('Manager Evaluation & Feedback', '6');
          checkPageBreak(80);

          if (sanitized.strengths) {
            doc.fillColor('#065F46').fontSize(8.5).font('Helvetica-Bold').text('1. Key Strengths:', 48, doc.y);
            doc.fillColor(darkText).fontSize(8.5).font('Helvetica').text(sanitized.strengths, 48, doc.y + 2, { width: contentWidth - 20 });
            doc.moveDown(0.5);
          }
          if (sanitized.improvements) {
            doc.fillColor('#92400E').fontSize(8.5).font('Helvetica-Bold').text('2. Areas for Improvement:', 48, doc.y);
            doc.fillColor(darkText).fontSize(8.5).font('Helvetica').text(sanitized.improvements, 48, doc.y + 2, { width: contentWidth - 20 });
            doc.moveDown(0.5);
          }
          if (sanitized.remarks) {
            doc.fillColor(primaryBlue).fontSize(8.5).font('Helvetica-Bold').text('3. Manager Remarks & Overall Feedback:', 48, doc.y);
            doc.fillColor(darkText).fontSize(8.5).font('Helvetica').text(sanitized.remarks, 48, doc.y + 2, { width: contentWidth - 20 });
            doc.moveDown(0.5);
          }
          if (sanitized.ratings && typeof sanitized.ratings === 'object') {
            doc.fillColor(primaryBlue).fontSize(8.5).font('Helvetica-Bold').text('4. Manager Category Ratings:', 48, doc.y);
            doc.moveDown(0.3);
            Object.entries(sanitized.ratings).forEach(([cat, val]) => {
              checkPageBreak(16);
              doc.fillColor(darkText).fontSize(8).font('Helvetica').text(cat, 55, doc.y, { width: 300 });
              doc.fillColor(primaryIndigo).fontSize(8).font('Helvetica-Bold').text(`${val} / 5`, 370, doc.y - 9, { width: 100, align: 'right' });
              doc.moveDown(0.3);
            });
          }
        }

        // --- FOOTER & PAGE NUMBERING ---
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          const footerY = doc.page.height - 30;
          doc.strokeColor(borderColor).lineWidth(0.5).moveTo(40, footerY - 5).lineTo(pageWidth - 40, footerY - 5).stroke();
          doc.fillColor(mutedText).fontSize(7.5).font('Helvetica').text(
            `WorkSphere • Confidential Performance Document • Generated ${new Date().toLocaleDateString('en-IN')}`,
            40,
            footerY,
            { align: 'left', width: 350 }
          );
          doc.text(`Page ${i + 1} of ${range.count}`, pageWidth - 140, footerY, {
            align: 'right',
            width: 100,
          });
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

}