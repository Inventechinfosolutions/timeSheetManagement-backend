import { User } from '../../../users/entities/user.entity';
import { UserType } from '../../../users/enums/user-type.enum';
import PDFDocument from 'pdfkit';
import { EmployeeDetails } from '../../../employeeTimeSheet/entities/employeeDetails.entity';
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { QuarterlyReview } from '../entities/quarterly-review.entity';
import { ReviewAssignment, AssignmentStatus } from '../entities/review-assignment.entity';
import { QuarterlyReviewAccessRequest, AccessRequestStatus } from '../entities/quarterly-review-access-request.entity';
import { CreateQuarterlyReviewDto } from '../dto/create-quarterly-review.dto';
import { AssignQuarterlyReviewDto, ActionAccessRequestDto } from '../dto/assign-quarterly-review.dto';
import { RevealRatingDto } from '../dto/reveal-rating.dto';
import { createRevealToken, isRevealTokenValid } from '../utils/rating-reveal.utils';
import { ReviewStatus } from '../enums/quarterly-review.enum';
import { ManagerMapping, ManagerMappingStatus } from '../../../managerMapping/entities/managerMapping.entity';
import { DocumentUploaderService } from '../../../common/document-uploader/services/document-uploader.service';
import { DocumentMetaInfo, EntityType, ReferenceType } from '../../../common/document-uploader/models/documentmetainfo.model';
import { NotificationsService } from '../../../notifications/Services/notifications.service';
import { MailService } from '../../../common/mail/mail.service';
import {
  getAppraisalQuarterAssignedTemplate,
  getAppraisalQuarterSubmittedEmployeeTemplate,
  getAppraisalQuarterSubmittedManagerTemplate,
} from '../../../common/mail/templates';

@Injectable()
export class QuarterlyReviewService {
  private readonly logger = new Logger(QuarterlyReviewService.name);

  constructor(
    @InjectRepository(QuarterlyReview)
    private readonly quarterlyReviewRepository: Repository<QuarterlyReview>,
    @InjectRepository(ReviewAssignment)
    private readonly assignmentRepository: Repository<ReviewAssignment>,
    @InjectRepository(QuarterlyReviewAccessRequest)
    private readonly accessRequestRepository: Repository<QuarterlyReviewAccessRequest>,
    private readonly documentUploaderService: DocumentUploaderService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) { }

  // ─── Utility / Helper Methods ─────────────────────────────────────────────

  getCurrentQuarter(): string {
    try {
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
    } catch (error: any) {
      this.logger.error(`[getCurrentQuarter] Error: ${error.message}`, error.stack);
      return 'Q1 FY2026-27';
    }
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

  private normalizeQuarter(quarterString: string): string {
    if (!quarterString) return '';
    const trimmed = quarterString.trim();
    if (/^Q\d-FY\d{4}-\d{2}$/i.test(trimmed)) {
      return trimmed.replace(/^(Q\d)-(FY\d{4}-\d{2})$/i, '$1 $2');
    }
    return trimmed;
  }

  parseQuarter(quarterString: string): { quarterNum: number; fyStartYear: number } | null {
    if (!quarterString) return null;
    const match = quarterString.trim().match(/^Q(\d)[\s-]*FY(\d{4})-(\d{2})$/i);
    if (!match) return null;
    return {
      quarterNum: parseInt(match[1], 10),
      fyStartYear: parseInt(match[2], 10),
    };
  }

  extractFinancialYear(quarterString?: string | null): string {
    if (!quarterString) return '';
    const match = quarterString.match(/FY\s*\d{4}-\d{2}/i);
    if (match) {
      return match[0].replace(/FY\s*/i, 'FY ');
    }
    const parsed = this.parseQuarter(quarterString);
    if (parsed) {
      return `FY ${parsed.fyStartYear}-${String(parsed.fyStartYear + 1).slice(-2)}`;
    }
    return '';
  }

  getNumericRatingScore(review: any): number | null {
    if (!review) return null;
    const parsedRatings = this.parseJsonIfNeeded(review.ratings);
    if (parsedRatings && typeof parsedRatings === 'object') {
      const categoryRatings = Object.values(parsedRatings)
        .map(Number)
        .filter((scoreValue) => !isNaN(scoreValue) && scoreValue > 0);
      if (categoryRatings.length > 0) {
        const totalRatingSum = categoryRatings.reduce(
          (runningTotal, currentScore) => runningTotal + currentScore,
          0,
        );
        return parseFloat((totalRatingSum / categoryRatings.length).toFixed(1));
      }
    }
    if (review.averageRating != null) {
      const parsedAvg = parseFloat(String(review.averageRating));
      if (!isNaN(parsedAvg) && parsedAvg > 0) return parseFloat(parsedAvg.toFixed(1));
    }
    if (review.finalRating) {
      const directNum = parseFloat(String(review.finalRating));
      if (!isNaN(directNum) && /^\s*[\d.]+\s*$/.test(String(review.finalRating))) {
        return parseFloat(directNum.toFixed(1));
      }
      const labelMap: Record<string, number> = {
        outstanding: 5.0,
        'exceeds expectations': 4.0,
        'meets expectations': 3.0,
        'needs improvement': 2.0,
        unsatisfactory: 1.0,
      };
      const norm = String(review.finalRating).toLowerCase().trim();
      if (labelMap[norm] !== undefined) {
        return labelMap[norm];
      }
    }
    return null;
  }

  getUserRole(user: any): 'ADMIN' | 'CEO' | 'MANAGER' | 'EMPLOYEE' {
    const rawRole = String(user?.userType || user?.role || '').toUpperCase();
    if (rawRole === 'ADMIN') return 'ADMIN';
    if (rawRole === 'CEO') return 'CEO';
    const isManager = rawRole === 'MANAGER' || (user?.designation && String(user.designation).toLowerCase().includes('manager'));
    if (isManager) return 'MANAGER';
    return 'EMPLOYEE';
  }

  canEmployeeEditReview(review: QuarterlyReview | null, quarterString: string, assignment?: ReviewAssignment | null): boolean {
    const now = new Date();
    if (review?.accessUntil && now <= new Date(review.accessUntil)) {
      return true;
    }
    if (assignment) {
      if (Boolean(assignment.isAccessOpen) && now <= new Date(assignment.deadlineAt)) {
        return true;
      }
      return false;
    }
    if (review) {
      const isAlreadySubmitted =
        review.status === ReviewStatus.SUBMITTED ||
        review.status === ReviewStatus.APPROVED ||
        review.status === ReviewStatus.COMPLETED ||
        review.reviewStatus === 'Reviewed' ||
        review.reviewStatus === 'Completed';
      if (isAlreadySubmitted) {
        return false;
      }
    }
    return false;
  }

  hasReviewStarted(review: QuarterlyReview | any): boolean {
    if (!review) return false;

    // Check overview: must have substantive text (at least 4 non-whitespace chars)
    const overviewText = review.overview ? String(review.overview).trim() : '';
    const hasOverview = overviewText.length >= 4;

    // Check projects: must have at least one project with a title or achievement
    const parsedProjects = this.parseJsonIfNeeded(review.projects);
    const hasProjects = Array.isArray(parsedProjects) && parsedProjects.some(
      (projectItem: any) => Boolean(
        (projectItem?.projectTitle && String(projectItem.projectTitle).trim().length > 0) ||
        (projectItem?.achievement && String(projectItem.achievement).trim().length > 0)
      )
    );

    // Check learning goals: must have at least one goal
    const parsedGoals = this.parseJsonIfNeeded(review.learningGoals);
    const hasGoals = Array.isArray(parsedGoals) && parsedGoals.some(
      (goalItem: any) => Boolean(
        (goalItem?.title && String(goalItem.title).trim().length > 0) ||
        (goalItem?.description && String(goalItem.description).trim().length > 0) ||
        (typeof goalItem === 'string' && goalItem.trim().length > 0)
      )
    );

    // Check team contributions / self rating: must have at least one rating > 0
    const parsedContribution = this.parseJsonIfNeeded(review.teamContribution ?? review.selfRating);
    const hasContribution = Array.isArray(parsedContribution) && parsedContribution.some(
      (contribItem: any) => Number(contribItem?.rating) > 0
    );

    // Check company environment: must have rating > 0 or feedback
    const parsedEnvironment = this.parseJsonIfNeeded(review.companyEnvironment);
    const hasEnvironment = Boolean(
      parsedEnvironment && (
        Number(parsedEnvironment.rating) > 0 ||
        (parsedEnvironment.feedback && String(parsedEnvironment.feedback).trim().length > 0) ||
        (parsedEnvironment.suggestions && String(parsedEnvironment.suggestions).trim().length > 0) ||
        (parsedEnvironment.workCultureFeedback && String(parsedEnvironment.workCultureFeedback).trim().length > 0)
      )
    );

    return hasOverview || hasProjects || hasGoals || hasContribution || hasEnvironment;
  }

  private sanitizeReview(review: QuarterlyReview | null, revealToken?: string): any | null {
    if (!review) return null;

    let projects = this.parseJsonIfNeeded(review.projects);
    const rawAchievements = this.parseJsonIfNeeded((review as any).achievements);
    const rawChallenges = this.parseJsonIfNeeded((review as any).challenges);

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

    const isEvaluated = Boolean(
      review.status === ReviewStatus.COMPLETED ||
      review.status === ReviewStatus.APPROVED ||
      review.reviewStatus === 'Reviewed' ||
      review.reviewStatus === 'Completed' ||
      review.finalRating
    );

    const numericScore = isEvaluated ? this.getNumericRatingScore(review) : null;

    const isTokenValid = Boolean(
      revealToken && review.id && isRevealTokenValid(revealToken, review.id, review.employeeId),
    );
    const hideFinalRating = isEvaluated && !isTokenValid;

    const isSubmitted =
      Boolean(review.submittedDate) ||
      review.status === ReviewStatus.SUBMITTED ||
      review.status === ReviewStatus.COMPLETED ||
      review.status === ReviewStatus.APPROVED ||
      review.status === ReviewStatus.IN_REVIEW ||
      review.status === ReviewStatus.REVIEWED ||
      review.status === ReviewStatus.AUTO_SUBMITTED ||
      (review as any).assignment?.status === AssignmentStatus.SUBMITTED ||
      (review as any).assignment?.status === AssignmentStatus.AUTO_SUBMITTED ||
      (review as any).assignment?.status === AssignmentStatus.COMPLETED ||
      review.submissionType === 'AUTO';

    const isExplicitDraft = review.status === ReviewStatus.DRAFT;
    const hasStarted = isExplicitDraft || this.hasReviewStarted(review);

    const isDraft = !isSubmitted && hasStarted;

    const submissionStatus: 'Not Started' | 'Draft' | 'Submitted' = isSubmitted
      ? 'Submitted'
      : isDraft
        ? 'Draft'
        : 'Not Started';

    const reviewCurrentStatus = isSubmitted
      ? review.status
      : isDraft
        ? ReviewStatus.DRAFT
        : ReviewStatus.NOT_STARTED;

    let deadlineDisplay = '-';
    if (submissionStatus !== 'Submitted') {
      const targetDeadline = review.deadlineAt || (review as any).assignment?.deadlineAt;
      if (targetDeadline) {
        const deadlineDate = new Date(targetDeadline);
        if (!isNaN(deadlineDate.getTime())) {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          deadlineDisplay = `${deadlineDate.getDate()} ${monthNames[deadlineDate.getMonth()]} ${deadlineDate.getFullYear()}`;
        }
      } else if ((review as any).assignment?.assignedAt) {
        const assignedDate = new Date(new Date((review as any).assignment.assignedAt).getTime() + 3 * 24 * 60 * 60 * 1000);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        deadlineDisplay = `${assignedDate.getDate()} ${monthNames[assignedDate.getMonth()]} ${assignedDate.getFullYear()}`;
      }
    }

    const assignedBy =
      (review as any).assignment?.assignedByName
        ? `${(review as any).assignment.assignedByName}${(review as any).assignment.assignedByRole ? ` (${(review as any).assignment.assignedByRole})` : ''}`
        : review.managerName || 'Manager / Admin';

    const parsedQuarterInfo = this.parseQuarter(review.quarter);
    const quarterCode = parsedQuarterInfo ? `Q${parsedQuarterInfo.quarterNum}` : (review.quarter?.split(' ')[0] || review.quarter);
    const financialYear = review.financialYear || (parsedQuarterInfo ? `FY ${parsedQuarterInfo.fyStartYear}-${String(parsedQuarterInfo.fyStartYear + 1).slice(-2)}` : this.extractFinancialYear(review.quarter));

    const finalRatingValue = !isEvaluated
      ? null
      : hideFinalRating
        ? null
        : (numericScore !== null ? numericScore.toFixed(1) : (review.finalRating || null));

    return {
      createdAt: (review as any).createdAt,
      updatedAt: (review as any).updatedAt,
      createdBy: (review as any).createdBy,
      updatedBy: (review as any).updatedBy,
      id: review.id,
      employeeId: review.employeeId,
      quarter: review.quarter,
      quarterCode,
      financialYear,
      assignedBy,
      submissionStatus,
      deadline: deadlineDisplay,
      displayDeadline: deadlineDisplay,
      status: reviewCurrentStatus,
      overview: review.overview,
      projects: projects ?? [],
      learningGoals: this.parseJsonIfNeeded(review.learningGoals) ?? [],
      teamContribution: Array.isArray(teamContrib) ? teamContrib : [],
      averageRating: avgRating,
      numericScore,
      companyEnvironment: companyEnv ?? null,
      submittedDate: review.submittedDate,
      managerName: review.managerName,
      startDate: review.startDate ?? null,
      endDate: review.endDate ?? null,
      reviewStatus: review.reviewStatus ?? null,
      finalRating: finalRatingValue,
      quarterRating: finalRatingValue,
      reviewedOn: review.reviewedOn ?? null,
      ratings: hideFinalRating ? null : (this.parseJsonIfNeeded(review.ratings) ?? null),
      isFinalRatingHidden: hideFinalRating,
      hasFinalRating: isEvaluated && (numericScore !== null || Boolean(review.finalRating)),
      strengths: review.strengths ?? null,
      improvements: review.improvements ?? null,
      remarks: review.remarks ?? null,
      evaluatorName: review.evaluatorName ?? null,
      evaluatorRole: review.evaluatorRole ?? null,
      evaluatorId: review.evaluatorId ?? null,
      autoSubmitted: review.autoSubmitted ?? 0,
      accessUntil: review.accessUntil ?? null,
      isReopened: review.isReopened ?? 0,
      assignmentId: review.assignmentId ?? null,
      submissionType: review.submissionType ?? null,
      deadlineAt: review.deadlineAt ?? null,
      accessRequestEligibleUntil: review.accessRequestEligibleUntil ?? null,
      assignment: (review as any).assignment ?? null,
      accessRequest: (review as any).accessRequest ?? null,
    };
  }

  // ─── Employee-facing Read Methods ─────────────────────────────────────────

  async findAllForEmployee(
    employeeId: string,
    financialYear?: string,
    quarter?: string,
    revealToken?: string,
  ): Promise<any> {
    this.logger.log(
      `Fetching all quarterly reviews for employee: ${employeeId}${financialYear ? ` | FY: ${financialYear}` : ''}${quarter ? ` | Quarter: ${quarter}` : ''}`
    );
    try {
      let allReviews: QuarterlyReview[] = [];
      try {
        allReviews = await this.quarterlyReviewRepository.find({
          where: { employeeId },
          order: { quarter: 'DESC' },
        });
      } catch (dbErr: any) {
        this.logger.warn(`Error finding reviews for employee ${employeeId}: ${dbErr.message}`);
        allReviews = [];
      }

      let assignments: ReviewAssignment[] = [];
      try {
        assignments = await this.assignmentRepository.find({
          where: { employeeId },
          order: { id: 'DESC' },
        });
      } catch (asErr: any) {
        this.logger.warn(`Could not query assignments for employee ${employeeId}: ${asErr.message}`);
      }

      let accessRequests: QuarterlyReviewAccessRequest[] = [];
      try {
        accessRequests = await this.accessRequestRepository.find({
          where: { employeeId },
          order: { id: 'DESC' },
        });
      } catch (accErr: any) {
        this.logger.warn(`Could not query access requests for employee ${employeeId}: ${accErr.message}`);
      }

      const reviewQuarters = new Set(allReviews.map((reviewItem) => this.normalizeQuarter(reviewItem.quarter)));
      for (const assignment of assignments) {
        const normQuarter = this.normalizeQuarter(assignment.quarter);
        if (!reviewQuarters.has(normQuarter)) {
          const syntheticReview: any = {
            id: undefined,
            employeeId,
            quarter: assignment.quarter,
            financialYear: assignment.financialYear,
            status: assignment.status === AssignmentStatus.AUTO_SUBMITTED ? ReviewStatus.AUTO_SUBMITTED : ReviewStatus.NOT_STARTED,
            overview: '',
            projects: [],
            learningGoals: [],
            teamContribution: [],
            averageRating: null,
            companyEnvironment: null,
            submittedDate: null,
            managerName: assignment.assignedByName || 'Manager / Admin',
            assignmentId: assignment.id,
            deadlineAt: assignment.deadlineAt,
            accessUntil: assignment.deadlineAt,
            accessRequestEligibleUntil: assignment.accessRequestEligibleUntil,
            assignment: {
              ...assignment,
              isAccessOpen: Boolean(assignment.isAccessOpen),
            },
          };
          allReviews.push(syntheticReview);
          reviewQuarters.add(normQuarter);
        }
      }

      // Sync any unstarted reviews in DB to NOT_STARTED
      for (const reviewRecord of allReviews) {
        if (
          reviewRecord.id &&
          !reviewRecord.submittedDate &&
          reviewRecord.status !== ReviewStatus.SUBMITTED &&
          reviewRecord.status !== ReviewStatus.COMPLETED &&
          reviewRecord.status !== ReviewStatus.APPROVED &&
          reviewRecord.status !== ReviewStatus.DRAFT &&
          !this.hasReviewStarted(reviewRecord)
        ) {
          if (reviewRecord.status !== ReviewStatus.NOT_STARTED) {
            reviewRecord.status = ReviewStatus.NOT_STARTED;
            this.quarterlyReviewRepository
              .update(reviewRecord.id, { status: ReviewStatus.NOT_STARTED })
              .catch((errorItem: any) =>
                this.logger.warn(`Could not sync review status in DB for review ${reviewRecord.id}: ${errorItem.message}`)
              );
          }
        }
      }

      const allSanitized = allReviews.map((reviewRecord) => {
        const normQuarter = this.normalizeQuarter(reviewRecord.quarter);
        const matchingRequest = accessRequests.find(
          (requestItem) => requestItem.quarter === reviewRecord.quarter || this.normalizeQuarter(requestItem.quarter) === normQuarter
        );
        const matchingAssignment = assignments.find(
          (assignmentItem) => assignmentItem.quarter === reviewRecord.quarter || this.normalizeQuarter(assignmentItem.quarter) === normQuarter
        );
        (reviewRecord as any).accessRequest = matchingRequest || null;
        if (matchingAssignment && !(reviewRecord as any).assignment) {
          (reviewRecord as any).assignment = {
            ...matchingAssignment,
            isAccessOpen: Boolean(matchingAssignment.isAccessOpen),
          };
        }
        return this.sanitizeReview(reviewRecord, revealToken);
      });

      // Target current and selected quarter/FY
      const currentQuarter = this.getCurrentQuarter();
      const currentFinancialYear = this.extractFinancialYear(currentQuarter);

      const targetFinancialYear = financialYear ? financialYear.trim() : currentFinancialYear;
      const normalizedTargetFY = targetFinancialYear.replace(/\s+/g, '').toUpperCase();

      const targetQuarter = quarter ? quarter.trim() : currentQuarter;
      const targetQuarterCode = targetQuarter.split(' ')[0].toUpperCase();

      // Overall rating for the selected Financial Year
      const financialYearReviews = allSanitized.filter((reviewRecord) => {
        const recordFY = (reviewRecord.financialYear || this.extractFinancialYear(reviewRecord.quarter)).replace(/\s+/g, '').toUpperCase();
        const recordQuarter = (reviewRecord.quarter || '').replace(/\s+/g, '').toUpperCase();
        return recordFY.includes(normalizedTargetFY) || recordQuarter.includes(normalizedTargetFY);
      });

      const evaluatedFYReviews = financialYearReviews.filter((reviewRecord) => reviewRecord.hasFinalRating && reviewRecord.numericScore !== null);
      let hasYearRating = evaluatedFYReviews.length > 0;
      let isYearRatingHidden = false;
      let yearRatingValue: string | null = null;
      if (hasYearRating) {
        const averageYearScore = evaluatedFYReviews.reduce(
          (runningTotal, reviewRecord) => runningTotal + reviewRecord.numericScore,
          0,
        ) / evaluatedFYReviews.length;
        yearRatingValue = averageYearScore.toFixed(1);
        isYearRatingHidden = evaluatedFYReviews.some((reviewRecord) => reviewRecord.isFinalRatingHidden);
      }
      const yearRating = isYearRatingHidden ? null : yearRatingValue;

      // Rating and status for target quarter
      const targetReview = allSanitized.find((reviewRecord) => {
        const isQuarterMatch = quarter
          ? (reviewRecord.quarterCode === targetQuarterCode || reviewRecord.quarter?.toUpperCase().startsWith(targetQuarterCode))
          : (reviewRecord.quarter === currentQuarter || this.normalizeQuarter(reviewRecord.quarter) === this.normalizeQuarter(currentQuarter));
        if (financialYear) {
          const recordFY = (reviewRecord.financialYear || this.extractFinancialYear(reviewRecord.quarter)).replace(/\s+/g, '').toUpperCase();
          return isQuarterMatch && recordFY.includes(normalizedTargetFY);
        }
        return isQuarterMatch;
      });

      const hasQuarterRating = Boolean(targetReview?.hasFinalRating && targetReview?.numericScore !== null);
      const isQuarterRatingHidden = Boolean(targetReview?.isFinalRatingHidden);
      const quarterRating = isQuarterRatingHidden
        ? null
        : (targetReview?.finalRating || (targetReview?.numericScore !== null && targetReview?.numericScore !== undefined ? targetReview.numericScore.toFixed(1) : null));
      const reviewStatus = targetReview?.reviewStatus || (targetReview ? (targetReview.submissionStatus === 'Submitted' ? 'Under Review' : '—') : '—');

      // Filter reviews list for history table
      let filteredReviews = allSanitized;
      if (financialYear) {
        const normalizedFYFilter = financialYear.replace(/\s+/g, '').toUpperCase();
        filteredReviews = filteredReviews.filter((reviewRecord) => {
          const recordFY = (reviewRecord.financialYear || this.extractFinancialYear(reviewRecord.quarter)).replace(/\s+/g, '').toUpperCase();
          const recordQuarter = (reviewRecord.quarter || '').replace(/\s+/g, '').toUpperCase();
          return recordFY.includes(normalizedFYFilter) || recordQuarter.includes(normalizedFYFilter);
        });
      }
      if (quarter) {
        const quarterCodeFilter = quarter.trim().split(' ')[0].toUpperCase();
        filteredReviews = filteredReviews.filter((reviewRecord) => {
          return reviewRecord.quarterCode === quarterCodeFilter || reviewRecord.quarter?.toUpperCase().startsWith(quarterCodeFilter);
        });
      }

      // Attach Year Rating for each review's financial year
      filteredReviews.forEach((reviewRecord) => {
        const recordFYNormalized = (reviewRecord.financialYear || this.extractFinancialYear(reviewRecord.quarter)).replace(/\s+/g, '').toUpperCase();
        const matchingFYReviews = allSanitized.filter((fyReviewItem) => {
          const itemFY = (fyReviewItem.financialYear || this.extractFinancialYear(fyReviewItem.quarter)).replace(/\s+/g, '').toUpperCase();
          return itemFY === recordFYNormalized;
        });
        const evaluatedMatchingReviews = matchingFYReviews.filter((fyReviewItem) => fyReviewItem.hasFinalRating && fyReviewItem.numericScore !== null);
        if (evaluatedMatchingReviews.length > 0) {
          const averageScore = evaluatedMatchingReviews.reduce(
            (runningTotal, fyReviewItem) => runningTotal + fyReviewItem.numericScore,
            0,
          ) / evaluatedMatchingReviews.length;
          const isRatingHidden = evaluatedMatchingReviews.some((fyReviewItem) => fyReviewItem.isFinalRatingHidden);
          reviewRecord.yearRating = isRatingHidden ? null : averageScore.toFixed(1);
          reviewRecord.hasYearRating = true;
          reviewRecord.isYearRatingHidden = isRatingHidden;
        } else {
          reviewRecord.yearRating = null;
          reviewRecord.hasYearRating = false;
          reviewRecord.isYearRatingHidden = false;
        }
      });

      const summary = {
        yearRating,
        yearRatingScore: yearRatingValue,
        hasYearRating,
        isYearRatingHidden,
        quarterRating,
        quarterRatingScore: targetReview?.numericScore !== null && targetReview?.numericScore !== undefined ? targetReview.numericScore.toFixed(1) : null,
        hasQuarterRating,
        isQuarterRatingHidden,
        reviewStatus,
        targetQuarter,
        targetFY: targetFinancialYear,
        submissionStatus: targetReview?.submissionStatus || 'Not Started',
        deadline: targetReview?.deadline || '-',
        activeReview: targetReview || null,
      };

      return Object.assign(filteredReviews, { reviews: filteredReviews, summary });
    } catch (error: any) {
      this.logger.error(`Error fetching quarterly reviews for employee ${employeeId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch quarterly reviews: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOneByQuarter(employeeId: string, quarter: string, revealToken?: string): Promise<any | null> {
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
        this.logger.warn(`Error finding review for employee ${employeeId}, quarter ${quarter}: ${dbErr.message}`);
      }

      let matchingAssignment: ReviewAssignment | null = null;
      try {
        matchingAssignment = await this.assignmentRepository.findOne({
          where: [
            { employeeId, quarter: canonicalQuarter },
            { employeeId, quarter: quarter.trim() },
          ],
          order: { id: 'DESC' },
        });
      } catch (asErr: any) {
        this.logger.warn(`Could not find assignment for single review: ${asErr.message}`);
      }

      if (!review && matchingAssignment) {
        const syntheticReview: any = {
          id: undefined,
          employeeId,
          quarter: canonicalQuarter,
          status: matchingAssignment.status === AssignmentStatus.AUTO_SUBMITTED ? ReviewStatus.AUTO_SUBMITTED : ReviewStatus.DRAFT,
          overview: '',
          projects: [],
          learningGoals: [],
          teamContribution: [],
          averageRating: null,
          companyEnvironment: null,
          submittedDate: null,
          managerName: matchingAssignment.assignedByName || 'Manager / Admin',
          assignmentId: matchingAssignment.id,
          deadlineAt: matchingAssignment.deadlineAt,
          accessUntil: matchingAssignment.deadlineAt,
          accessRequestEligibleUntil: matchingAssignment.accessRequestEligibleUntil,
          assignment: {
            ...matchingAssignment,
            isAccessOpen: Boolean(matchingAssignment.isAccessOpen),
          },
        };
        return this.sanitizeReview(syntheticReview, revealToken);
      }

      if (review) {
        try {
          const matchingRequest = await this.accessRequestRepository.findOne({
            where: [
              { employeeId, quarter: canonicalQuarter },
              { employeeId, quarter: quarter.trim() },
            ],
            order: { id: 'DESC' },
          });
          (review as any).accessRequest = matchingRequest || null;
          if (matchingAssignment) {
            (review as any).assignment = {
              ...matchingAssignment,
              isAccessOpen: Boolean(matchingAssignment.isAccessOpen),
            };
          }
        } catch (accErr: any) {
          this.logger.warn(`Could not query access request for single review: ${accErr.message}`);
        }
      }

      return this.sanitizeReview(review, revealToken);
    } catch (error: any) {
      this.logger.error(`Error fetching quarterly review for employee ${employeeId}, quarter ${quarter}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to fetch quarterly review: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async verifyAndRevealRating(currentUser: any, dto: RevealRatingDto) {
    const loginId = currentUser?.loginId;
    if (!loginId) {
      throw new UnauthorizedException('User session is invalid.');
    }

    const submittedEmail = (dto.email || '').trim().toLowerCase();
    const submittedPassword = dto.password || '';

    if (!submittedEmail || !submittedPassword) {
      throw new BadRequestException('Registered email and password are required.');
    }

    // 1. Fetch user and employee details
    const userRepo = this.quarterlyReviewRepository.manager.getRepository(User);
    const employeeRepo = this.quarterlyReviewRepository.manager.getRepository(EmployeeDetails);

    const [user, employeeDetail] = await Promise.all([
      userRepo.findOne({
        where: { loginId },
        select: ['id', 'loginId', 'aliasLoginName', 'password', 'userType', 'role'],
      }),
      employeeRepo.findOne({
        where: { employeeId: loginId },
      }),
    ]);

    if (!user && !employeeDetail) {
      throw new BadRequestException('User account not found.');
    }

    // Specifically verify against the email given in employee details
    const registeredEmail = (employeeDetail?.email || user?.loginId || '').toLowerCase().trim();

    if (!registeredEmail || submittedEmail !== registeredEmail) {
      this.logger.warn(`Reveal rating email mismatch for ${loginId}: submitted '${submittedEmail}', expected '${registeredEmail}'`);
      throw new BadRequestException('Submitted email does not match your registered email in employee details.');
    }

    // 2. Compare password with bcrypt
    const passwordHash = user?.password || employeeDetail?.password || '';
    const isPasswordValid = await bcrypt.compare(submittedPassword, passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(`Reveal rating password mismatch for user ${loginId}`);
      throw new BadRequestException('Incorrect password. Please try again.');
    }

    // 3. Find the target review
    let review: QuarterlyReview | null = null;
    if (dto.reviewId && !isNaN(Number(dto.reviewId))) {
      review = await this.quarterlyReviewRepository.findOne({ where: { id: Number(dto.reviewId) } });
    }

    const targetEmployeeId = dto.employeeId || loginId;
    if (!review && dto.quarter) {
      const canonicalQuarter = this.normalizeQuarter(dto.quarter);
      review = await this.quarterlyReviewRepository.findOne({
        where: [
          { employeeId: targetEmployeeId, quarter: canonicalQuarter },
          { employeeId: targetEmployeeId, quarter: dto.quarter.trim() },
        ],
        order: { id: 'DESC' },
      });
    }

    if (!review && dto.reviewId && isNaN(Number(dto.reviewId))) {
      const canonicalQuarter = this.normalizeQuarter(String(dto.reviewId));
      review = await this.quarterlyReviewRepository.findOne({
        where: [
          { employeeId: targetEmployeeId, quarter: canonicalQuarter },
          { employeeId: targetEmployeeId, quarter: String(dto.reviewId).trim() },
        ],
        order: { id: 'DESC' },
      });
    }

    if (!review) {
      throw new NotFoundException('Quarterly review not found.');
    }

    // 4. Check permissions
    const userRole = this.getUserRole(currentUser);
    const isOwner = review.employeeId === loginId;
    const isPrivileged = userRole === 'ADMIN' || userRole === 'CEO';
    const isEvaluator =
      review.evaluatorId === loginId ||
      review.managerName === loginId ||
      review.managerName === (currentUser?.aliasLoginName || currentUser?.fullName);

    if (!isOwner && !isPrivileged && !isEvaluator && userRole !== 'MANAGER') {
      throw new ForbiddenException('You are not authorized to view the final rating for this review.');
    }

    // 5. Ensure evaluation is completed/has rating
    const isEvaluated =
      review.status === ReviewStatus.COMPLETED ||
      review.status === ReviewStatus.APPROVED ||
      review.reviewStatus === 'Reviewed' ||
      review.reviewStatus === 'Completed' ||
      Boolean(review.finalRating);

    if (!isEvaluated && !review.finalRating) {
      throw new BadRequestException('Evaluation has not been completed for this review yet.');
    }

    // 6. Generate 2-minute token and timestamps (120,000 ms)
    const revealedAt = Date.now();
    const expiresAt = revealedAt + 120 * 1000;
    const userId = user?.id || String(employeeDetail?.id || loginId);
    const userLoginId = user?.loginId || employeeDetail?.employeeId || loginId;
    const revealToken = createRevealToken(userId, userLoginId, review.id, expiresAt);

    this.logger.log(`Final rating revealed for review ${review.id} by user ${loginId}, expires in 120s`);

    // Compute numeric average rating score rather than returning raw text label
    const parsedRatings = this.parseJsonIfNeeded(review.ratings);
    let averageScore: string | null = null;
    if (parsedRatings && typeof parsedRatings === 'object') {
      const ratingScores = Object.values(parsedRatings)
        .map(Number)
        .filter((ratingValue) => !isNaN(ratingValue) && ratingValue > 0);
      if (ratingScores.length > 0) {
        averageScore = (
          ratingScores.reduce((runningTotal, ratingValue) => runningTotal + ratingValue, 0) /
          ratingScores.length
        ).toFixed(1);
      }
    }
    if (!averageScore && review.averageRating != null) {
      const parsedAvg = parseFloat(String(review.averageRating));
      if (!isNaN(parsedAvg)) averageScore = parsedAvg.toFixed(1);
    }
    if (!averageScore && review.finalRating) {
      const directNum = parseFloat(String(review.finalRating));
      if (!isNaN(directNum) && /^\s*[\d.]+\s*$/.test(String(review.finalRating))) {
        averageScore = directNum.toFixed(1);
      } else {
        const labelMap: Record<string, string> = {
          outstanding: '5.0',
          'exceeds expectations': '4.0',
          'meets expectations': '3.0',
          'needs improvement': '2.0',
          unsatisfactory: '1.0',
        };
        const norm = String(review.finalRating).toLowerCase().trim();
        averageScore = labelMap[norm] || null;
      }
    }

    return {
      reviewId: review.id,
      employeeId: review.employeeId,
      quarter: review.quarter,
      finalRating: averageScore || review.finalRating,
      averageRating: averageScore,
      ratings: parsedRatings,
      revealedAt,
      expiresAt,
      revealToken,
    };
  }

  // ─── Assignment Methods ────────────────────────────────────────────────────

  async getAssignableEmployees(user: any, quarter?: string): Promise<any[]> {
    const userRole = this.getUserRole(user);
    const userId = user?.loginId || '';
    const userFullName = user?.aliasLoginName || user?.fullName || user?.name || userId;
    this.logger.log(`[getAssignableEmployees] user='${userId}', role='${userRole}', name='${userFullName}', quarter='${quarter || 'not provided'}'`);
    try {
      if (userRole === 'EMPLOYEE') {
        throw new ForbiddenException('Employees are not authorized to assign quarterly reviews.');
      }

      const isPrivileged = userRole === 'ADMIN' || userRole === 'CEO';
      let candidateList: Array<{ employeeId: string; employeeName: string; designation: string; department: string; email: string }> = [];

      if (isPrivileged) {
        const empRepo = this.quarterlyReviewRepository.manager.getRepository(EmployeeDetails);
        const employees = await empRepo.find({ order: { fullName: 'ASC' } });
        candidateList = employees
          .filter((emp) => emp.employeeId && emp.employeeId !== userId)
          .map((emp) => ({
            employeeId: emp.employeeId,
            employeeName: emp.fullName || emp.employeeId,
            designation: emp.designation || 'Employee',
            department: emp.department || '',
            email: emp.email || '',
          }));
      } else {
        // Manager: get mapped active employees
        const mappingRepo = this.quarterlyReviewRepository.manager.getRepository(ManagerMapping);
        const mappings = await mappingRepo.find({
          where: [
            { managerName: userFullName, status: ManagerMappingStatus.ACTIVE },
            { managerName: userId, status: ManagerMappingStatus.ACTIVE },
            { managerId: userId, status: ManagerMappingStatus.ACTIVE },
          ],
        });

        const mappedEmployeeIds = Array.from(
          new Set(
            mappings.map((m) => m.employeeId).filter((id) => id && id !== userId)
          )
        );

        if (mappedEmployeeIds.length === 0) {
          return [];
        }

        const empRepo = this.quarterlyReviewRepository.manager.getRepository(EmployeeDetails);
        const employees = await empRepo.find({
          where: { employeeId: In(mappedEmployeeIds) },
          order: { fullName: 'ASC' },
        });

        candidateList = mappedEmployeeIds.map((empId) => {
          const detail = employees.find((e) => e.employeeId === empId);
          return {
            employeeId: empId,
            employeeName: detail?.fullName || empId,
            designation: detail?.designation || 'Team Member',
            department: detail?.department || '',
            email: detail?.email || '',
          };
        });
      }

      const targetQuarter = quarter ? this.normalizeQuarter(quarter) : this.normalizeQuarter(this.getCurrentQuarter());
      const candidateIds = candidateList.map((c) => c.employeeId);

      let assignmentsForQuarter: ReviewAssignment[] = [];
      let allAssignments: ReviewAssignment[] = [];
      if (candidateIds.length > 0) {
        [assignmentsForQuarter, allAssignments] = await Promise.all([
          this.assignmentRepository.find({
            where: [
              { employeeId: In(candidateIds), quarter: targetQuarter },
              ...(quarter ? [{ employeeId: In(candidateIds), quarter: quarter.trim() }] : []),
            ],
          }),
          this.assignmentRepository.find({
            where: { employeeId: In(candidateIds) },
          }),
        ]);
      }

      const assignedQuartersMap = new Map<string, string[]>();
      for (const assignmentRecord of allAssignments) {
        if (!assignmentRecord.quarter) continue;
        const quarterList = assignedQuartersMap.get(assignmentRecord.employeeId) || [];
        const normalizedQuarter = this.normalizeQuarter(assignmentRecord.quarter);
        if (!quarterList.includes(normalizedQuarter)) quarterList.push(normalizedQuarter);
        if (!quarterList.includes(assignmentRecord.quarter.trim())) quarterList.push(assignmentRecord.quarter.trim());
        assignedQuartersMap.set(assignmentRecord.employeeId, quarterList);
      }

      const assignmentMap = new Map<string, ReviewAssignment>();
      for (const assignmentItem of assignmentsForQuarter) {
        assignmentMap.set(assignmentItem.employeeId, assignmentItem);
      }

      return candidateList.map((candidate) => {
        const assignment = assignmentMap.get(candidate.employeeId);
        const assignedQuarters = assignedQuartersMap.get(candidate.employeeId) || [];
        return {
          ...candidate,
          quarter: targetQuarter,
          isAssigned: Boolean(assignment),
          assignedQuarters,
          assignmentStatus: assignment?.status || null,
          assignedAt: assignment?.assignedAt || null,
          deadlineAt: assignment?.deadlineAt || null,
          assignedByName: assignment?.assignedByName || null,
          assignedById: assignment?.assignedById || null,
          assignedByRole: assignment?.assignedByRole || null,
          assignmentId: assignment?.id || null,
          isAccessOpen: assignment ? Boolean(assignment.isAccessOpen) : false,
        };
      });
    } catch (error: any) {
      this.logger.error(`[getAssignableEmployees] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch assignable employees',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAssignedReviewsByManager(assignerUser: any, quarter?: string): Promise<any[]> {
    const assignerRole = this.getUserRole(assignerUser);
    const assignerId = assignerUser?.loginId || '';
    const assignerName = assignerUser?.aliasLoginName || assignerUser?.fullName || assignerUser?.name || assignerId;
    this.logger.log(`[getAssignedReviewsByManager] user='${assignerId}', role='${assignerRole}', quarterFilter='${quarter || 'all'}'`);

    try {
      if (assignerRole === 'EMPLOYEE') {
        throw new ForbiddenException('Employees are not authorized to view manager assignment lists.');
      }

      const isPrivileged = assignerRole === 'ADMIN' || assignerRole === 'CEO';
      let assignments: ReviewAssignment[] = [];

      if (isPrivileged) {
        const query = this.assignmentRepository.createQueryBuilder('assignment').orderBy('assignment.id', 'DESC');
        if (quarter?.trim()) {
          const canonicalQuarter = this.normalizeQuarter(quarter.trim());
          query.andWhere('(assignment.quarter = :quarter OR assignment.quarter = :canonical)', {
            quarter: quarter.trim(),
            canonical: canonicalQuarter,
          });
        }
        assignments = await query.getMany();
      } else {
        const mappingRepo = this.quarterlyReviewRepository.manager.getRepository(ManagerMapping);
        const mappings = await mappingRepo.find({
          where: [
            { managerName: assignerName, status: ManagerMappingStatus.ACTIVE },
            { managerName: assignerId, status: ManagerMappingStatus.ACTIVE },
            { managerId: assignerId, status: ManagerMappingStatus.ACTIVE },
          ],
        });
        const mappedEmployeeIds = Array.from(
          new Set(mappings.map((m) => m.employeeId).filter((id) => id && id !== assignerId)),
        );

        const query = this.assignmentRepository.createQueryBuilder('assignment');
        if (mappedEmployeeIds.length > 0) {
          query.where(
            '(assignment.assignedById = :assignerId OR assignment.assignedByName = :assignerName OR assignment.employeeId IN (:...mappedEmployeeIds))',
            { assignerId, assignerName, mappedEmployeeIds },
          );
        } else {
          query.where(
            '(assignment.assignedById = :assignerId OR assignment.assignedByName = :assignerName)',
            { assignerId, assignerName },
          );
        }

        if (quarter?.trim()) {
          const canonicalQuarter = this.normalizeQuarter(quarter.trim());
          query.andWhere('(assignment.quarter = :quarter OR assignment.quarter = :canonical)', {
            quarter: quarter.trim(),
            canonical: canonicalQuarter,
          });
        }

        query.orderBy('assignment.id', 'DESC');
        assignments = await query.getMany();
      }

      if (assignments.length === 0) {
        return [];
      }

      const employeeIds = Array.from(new Set(assignments.map((a) => a.employeeId)));

      const empRepo = this.quarterlyReviewRepository.manager.getRepository(EmployeeDetails);
      const employees = await empRepo.find({
        where: { employeeId: In(employeeIds) },
      });

      const reviews = await this.quarterlyReviewRepository.find({
        where: { employeeId: In(employeeIds) },
      });

      const now = new Date();

      return assignments.map((a) => {
        const emp = employees.find((e) => e.employeeId === a.employeeId);
        const normQuarter = this.normalizeQuarter(a.quarter);
        const review = reviews.find(
          (r) =>
            r.employeeId === a.employeeId &&
            (r.quarter === a.quarter || this.normalizeQuarter(r.quarter) === normQuarter),
        );

        const isDeadlinePassed = now > new Date(a.deadlineAt);
        let liveStatus = a.status;
        if (
          a.isAccessOpen === 1 &&
          isDeadlinePassed &&
          a.status !== AssignmentStatus.SUBMITTED &&
          a.status !== AssignmentStatus.COMPLETED
        ) {
          liveStatus = AssignmentStatus.AUTO_SUBMITTED;
        }

        return {
          id: a.id,
          assignmentId: a.id,
          employeeId: a.employeeId,
          employeeName: emp?.fullName || a.employeeName || a.employeeId,
          designation: emp?.designation || 'Team Member',
          department: emp?.department || '—',
          email: emp?.email || null,
          quarter: a.quarter,
          financialYear: a.financialYear || null,
          assignedById: a.assignedById,
          assignedByName: a.assignedByName,
          assignedByRole: a.assignedByRole,
          assignedAt: a.assignedAt,
          deadlineAt: a.deadlineAt,
          status: liveStatus,
          isAccessOpen: Boolean(a.isAccessOpen),
          isDeadlinePassed,
          accessRequestEligibleUntil: a.accessRequestEligibleUntil,
          notes: a.notes || null,
          reviewId: review?.id || null,
          reviewStatus: review?.reviewStatus || review?.status || 'NOT_STARTED',
          submittedDate: review?.submittedDate || null,
          finalRating: review?.finalRating || null,
          averageRating: review?.averageRating != null ? parseFloat(String(review.averageRating)) : null,
          submissionType: review?.submissionType || null,
          isReopened: Boolean(review?.isReopened),
        };
      });
    } catch (error: any) {
      this.logger.error(`[getAssignedReviewsByManager] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch assigned reviews for manager',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async assignQuarterlyReview(assignerUser: any, dto: AssignQuarterlyReviewDto): Promise<any> {
    const assignerRole = this.getUserRole(assignerUser);
    const assignerId = assignerUser?.loginId;
    const assignerName = assignerUser?.aliasLoginName || assignerUser?.userName || assignerId;
    this.logger.log(`[assignQuarterlyReview] assignerId='${assignerId}', role='${assignerRole}', quarter='${dto.quarter}'`);
    try {
      if (assignerRole === 'EMPLOYEE') {
        throw new ForbiddenException('Employees are not authorized to assign quarterly reviews.');
      }

      // Determine eligible employees
      const assignable = await this.getAssignableEmployees(assignerUser);
      const assignableMap = new Map<string, { employeeId: string; employeeName: string; email?: string }>(
        assignable.map((e: any) => [e.employeeId, e])
      );

      let targetIds: string[] = [];

      if (dto.assignToAll) {
        targetIds = assignable.map((e: any) => e.employeeId);
        if (targetIds.length === 0) {
          throw new BadRequestException('No eligible employees found to assign.');
        }
      } else {
        const rawList = Array.isArray(dto.employeeIds) && dto.employeeIds.length > 0
          ? dto.employeeIds
          : dto.employeeId ? [dto.employeeId] : [];

        const cleanList = Array.from(new Set(rawList.map((id) => String(id).trim()).filter(Boolean)));
        if (cleanList.length === 0) {
          throw new BadRequestException('Please select at least one employee or choose to assign to all members.');
        }

        if (assignerRole === 'MANAGER') {
          for (const targetId of cleanList) {
            if (!assignableMap.has(targetId)) {
              throw new ForbiddenException(`Employee ${targetId} is not in your reporting hierarchy.`);
            }
          }
        }
        targetIds = cleanList;
      }

      // Normalize Quarter
      let canonicalQuarter = this.normalizeQuarter(dto.quarter);
      if (/^Q[1-4]$/i.test(canonicalQuarter.trim())) {
        const curQuarter = this.getCurrentQuarter();
        const fyMatch = curQuarter.match(/FY\d{4}-\d{2}/i);
        const fy = fyMatch ? fyMatch[0] : 'FY2026-27';
        canonicalQuarter = `${canonicalQuarter.trim().toUpperCase()} ${fy}`;
      }

      if (!canonicalQuarter) {
        throw new BadRequestException('Valid quarter is required (e.g. Q1 FY2026-27).');
      }

      let financialYear = dto.financialYear?.trim();
      if (!financialYear) {
        const fyMatch = canonicalQuarter.match(/FY\d{4}-\d{2}/i);
        financialYear = fyMatch ? fyMatch[0].toUpperCase() : 'FY2026-27';
      }

      const assignedAt = new Date();
      // 3 days (72 hours) window
      const deadlineAt = new Date(assignedAt.getTime() + 72 * 60 * 60 * 1000);

      const savedAssignments: ReviewAssignment[] = [];
      const empRepo = this.quarterlyReviewRepository.manager.getRepository(EmployeeDetails);

      for (const targetEmployeeId of targetIds) {
        let empInfo = assignableMap.get(targetEmployeeId);
        if (!empInfo) {
          const empRec = await empRepo.findOne({ where: { employeeId: targetEmployeeId } });
          empInfo = {
            employeeId: targetEmployeeId,
            employeeName: empRec?.fullName || targetEmployeeId,
            email: empRec?.email,
          };
        }
        const targetEmployeeName = empInfo.employeeName;

        let assignment = await this.assignmentRepository.findOne({
          where: [
            { employeeId: targetEmployeeId, quarter: canonicalQuarter },
            { employeeId: targetEmployeeId, quarter: dto.quarter.trim() },
          ],
        });

        if (assignment) {
          if (dto.assignToAll) {
            // In bulk assign mode, skip members who already have this quarter assigned
            continue;
          }
          throw new BadRequestException(
            `${canonicalQuarter} is already assigned to ${targetEmployeeName} (${targetEmployeeId}). Re-assignment is not allowed; access can only be renewed via an approved Access Request.`,
          );
        }

        assignment = this.assignmentRepository.create({
          employeeId: targetEmployeeId,
          employeeName: targetEmployeeName,
          quarter: canonicalQuarter,
          financialYear,
          assignedById: assignerId,
          assignedByName: assignerName,
          assignedByRole: assignerRole as any,
          assignedAt,
          deadlineAt,
          status: AssignmentStatus.ASSIGNED,
          isAccessOpen: 1,
          accessRequestEligibleUntil: null,
          notes: dto.notes || null,
          createdBy: assignerName,
          updatedBy: assignerName,
        });

        const saved = await this.assignmentRepository.save(assignment);
        savedAssignments.push(saved);

        let review = await this.quarterlyReviewRepository.findOne({
          where: [
            { employeeId: targetEmployeeId, quarter: canonicalQuarter },
            { employeeId: targetEmployeeId, quarter: dto.quarter.trim() },
          ],
        });

        if (review) {
          review.assignmentId = saved.id;
          review.deadlineAt = deadlineAt;
          review.accessUntil = deadlineAt;
          if (!this.hasReviewStarted(review) && !review.submittedDate && review.status !== ReviewStatus.SUBMITTED) {
            review.status = ReviewStatus.NOT_STARTED;
          }
          review.updatedBy = assignerName;
          await this.quarterlyReviewRepository.save(review);
        } else {
          review = this.quarterlyReviewRepository.create({
            employeeId: targetEmployeeId,
            quarter: canonicalQuarter,
            financialYear: (saved as any).financialYear || this.extractFinancialYear(canonicalQuarter) || null,
            status: ReviewStatus.NOT_STARTED,
            assignmentId: saved.id,
            deadlineAt,
            accessUntil: deadlineAt,
            createdBy: assignerName,
            updatedBy: assignerName,
            managerName: assignerName,
          } as any) as unknown as QuarterlyReview;
          await this.quarterlyReviewRepository.save(review as any);
        }

        try {
          await this.notificationsService.createNotification({
            employeeId: targetEmployeeId,
            title: `Quarterly Review Assigned: ${canonicalQuarter}`,
            message: `Your ${assignerRole.toLowerCase()} ${assignerName} has assigned the ${canonicalQuarter} review. Please complete and submit it within 3 days (Deadline: ${deadlineAt.toLocaleDateString('en-IN')}).`,
            type: 'alert',
          });

          if (empInfo.email) {
            const subject = `Quarterly Review Assigned: ${canonicalQuarter}`;
            const plainText = `Congratulations ${targetEmployeeName}, your quarterly review for ${canonicalQuarter} has been assigned by ${assignerName} (${assignerRole}). Please log in to WorkSphere and complete your review before the deadline: ${deadlineAt.toLocaleDateString('en-IN')} ${deadlineAt.toLocaleTimeString('en-IN')}.`;
            const htmlBody = getAppraisalQuarterAssignedTemplate({
              employeeName: targetEmployeeName,
              quarter: canonicalQuarter,
              assignedByName: assignerName,
              assignedByRole: assignerRole,
              deadlineAt,
              financialYear,
              notes: dto.notes || null,
            });
            await this.mailService.sendMailAsync(empInfo.email, subject, plainText, htmlBody);
          }
        } catch (notifErr: any) {
          this.logger.warn(`Failed to dispatch assignment notification/email: ${notifErr.message}`);
        }
      }

      if (savedAssignments.length === 0) {
        throw new BadRequestException(
          dto.assignToAll
            ? `All eligible members are already assigned to ${canonicalQuarter}. Re-assignment is not allowed; access can only be renewed via an approved Access Request.`
            : `Selected member(s) are already assigned to ${canonicalQuarter}. Re-assignment is not allowed; access can only be renewed via an approved Access Request.`
        );
      }

      return {
        success: true,
        message: `Quarterly review for ${canonicalQuarter} assigned to ${savedAssignments.length} member(s) successfully.`,
        data: {
          assignedCount: savedAssignments.length,
          quarter: canonicalQuarter,
          assignments: savedAssignments,
        },
      };
    } catch (error: any) {
      this.logger.error(`[assignQuarterlyReview] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to assign quarterly review',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getMyReviewAssignments(employeeId: string): Promise<any[]> {
    this.logger.log(`[getMyReviewAssignments] Fetching assignments for ${employeeId}`);
    try {
      const assignments = await this.assignmentRepository.find({
        where: { employeeId },
        order: { id: 'DESC' },
      });

      const now = new Date();
      for (const a of assignments) {
        if (
          a.isAccessOpen === 1 &&
          now > new Date(a.deadlineAt) &&
          a.status !== AssignmentStatus.SUBMITTED &&
          a.status !== AssignmentStatus.COMPLETED
        ) {
          a.status = AssignmentStatus.AUTO_SUBMITTED;
          a.isAccessOpen = 0;
          a.accessRequestEligibleUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          await this.assignmentRepository.save(a);
        }
      }

      return assignments.map((a) => ({
        id: a.id,
        employeeId: a.employeeId,
        employeeName: a.employeeName,
        quarter: a.quarter,
        financialYear: a.financialYear,
        assignedById: a.assignedById,
        assignedByName: a.assignedByName,
        assignedByRole: a.assignedByRole,
        assignedAt: a.assignedAt,
        deadlineAt: a.deadlineAt,
        status: a.status,
        isAccessOpen: Boolean(a.isAccessOpen),
        accessRequestEligibleUntil: a.accessRequestEligibleUntil,
        notes: a.notes,
      }));
    } catch (error: any) {
      this.logger.error(`[getMyReviewAssignments] Error for ${employeeId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch review assignments',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── Save / Submit ─────────────────────────────────────────────────────────

  async saveOrSubmit(employeeId: string, dto: CreateQuarterlyReviewDto, username: string): Promise<any> {
    const rawQuarter = typeof dto.quarter === 'string' ? dto.quarter.trim() : '';
    const canonicalQuarter = this.normalizeQuarter(rawQuarter);
    const { status, overview, projects, learningGoals, teamContribution, averageRating, companyEnvironment, startDate, endDate } = dto;
    this.logger.log(`[saveOrSubmit] employeeId='${employeeId}' | quarter='${canonicalQuarter}' | status='${status}'`);

    try {
      const now = new Date();

      const assignmentWhere: any[] = [];
      if (dto.assignmentId && !isNaN(Number(dto.assignmentId))) {
        assignmentWhere.push({ id: Number(dto.assignmentId) });
      }
      if (canonicalQuarter) {
        assignmentWhere.push({ employeeId, quarter: canonicalQuarter });
        assignmentWhere.push({ employeeId, quarter: canonicalQuarter.replace('FY', 'FY ') });
        assignmentWhere.push({ employeeId, quarter: canonicalQuarter.replace('FY ', 'FY') });
      }
      if (rawQuarter && rawQuarter !== canonicalQuarter) {
        assignmentWhere.push({ employeeId, quarter: rawQuarter });
      }

      let assignment: ReviewAssignment | null = null;
      if (assignmentWhere.length > 0) {
        assignment = await this.assignmentRepository.findOne({
          where: assignmentWhere,
          order: { id: 'DESC' },
        }).catch(() => null);
      }

      let existing: QuarterlyReview | null = null;
      if (dto.id && !isNaN(Number(dto.id))) {
        existing = await this.quarterlyReviewRepository.findOne({ where: { id: Number(dto.id) } }).catch(() => null);
      }
      if (!existing && assignment?.id) {
        existing = await this.quarterlyReviewRepository.findOne({ where: { employeeId, assignmentId: assignment.id } }).catch(() => null);
      }
      if (!existing) {
        const reviewWhere: any[] = [];
        if (canonicalQuarter) {
          reviewWhere.push({ employeeId, quarter: canonicalQuarter });
          reviewWhere.push({ employeeId, quarter: canonicalQuarter.replace('FY', 'FY ') });
          reviewWhere.push({ employeeId, quarter: canonicalQuarter.replace('FY ', 'FY') });
        }
        if (rawQuarter && rawQuarter !== canonicalQuarter) {
          reviewWhere.push({ employeeId, quarter: rawQuarter });
        }
        if (reviewWhere.length > 0) {
          existing = await this.quarterlyReviewRepository.findOne({
            where: reviewWhere,
            order: { id: 'DESC' },
          }).catch(() => null);
        }
      }

      const hasActiveExtension = (existing?.accessUntil && now <= new Date(existing.accessUntil)) || Boolean(existing?.isReopened);
      const hasAssignmentOpen = assignment && (
        Boolean(assignment.isAccessOpen) ||
        !assignment.deadlineAt ||
        now <= new Date(assignment.deadlineAt) ||
        hasActiveExtension
      );

      if (!assignment && !hasActiveExtension && (!existing || existing.status !== ReviewStatus.DRAFT)) {
        throw new ForbiddenException(
          `Quarterly review for ${canonicalQuarter || 'this quarter'} has not been assigned to you. Reviews are opened only when assigned by your Manager, Admin, or CEO.`
        );
      }

      if (status === ReviewStatus.SUBMITTED && !hasAssignmentOpen && !hasActiveExtension) {
        throw new ForbiddenException(
          `The submission window for ${canonicalQuarter || 'this quarter'} review has expired.`
        );
      }

      if (existing) {
        const isSubmittedState =
          existing.status === ReviewStatus.SUBMITTED ||
          existing.status === ReviewStatus.APPROVED ||
          existing.status === ReviewStatus.COMPLETED;
        if (!hasActiveExtension && isSubmittedState) {
          throw new BadRequestException(`Quarterly review for ${canonicalQuarter || 'this quarter'} has already been submitted and cannot be modified.`);
        }
      }

      const managerMapping = await this.quarterlyReviewRepository.manager
        .getRepository(ManagerMapping)
        .findOne({
          where: { employeeId, status: ManagerMappingStatus.ACTIVE },
        })
        .catch(() => null);

      let activeManagerName = managerMapping ? managerMapping.managerName : null;
      if (!activeManagerName) {
        activeManagerName = dto.managerName || assignment?.assignedByName || 'CEO & Admin';
      }

      let computedAvg: number | null = null;
      if (typeof averageRating === 'number' && !isNaN(averageRating) && isFinite(averageRating)) {
        computedAvg = averageRating;
      } else if (typeof averageRating === 'string' && !isNaN(parseFloat(averageRating))) {
        computedAvg = parseFloat(averageRating);
      }
      if (Array.isArray(teamContribution) && teamContribution.length > 0) {
        const validRatings = teamContribution
          .map((contributionItem: any) => Number(contributionItem?.rating))
          .filter((ratingValue: number) => !isNaN(ratingValue) && isFinite(ratingValue) && ratingValue > 0);
        if (validRatings.length > 0) {
          const totalRatingSum = validRatings.reduce((runningTotal: number, ratingValue: number) => runningTotal + ratingValue, 0);
          computedAvg = Math.round((totalRatingSum / validRatings.length) * 10) / 10;
        }
      }
      if (computedAvg !== null && (isNaN(computedAvg) || !isFinite(computedAvg))) {
        computedAvg = null;
      }

      let cleanStartDate: string | null = null;
      if (typeof startDate === 'string' && startDate.trim().length > 0) {
        cleanStartDate = startDate.trim().slice(0, 10);
      }
      let cleanEndDate: string | null = null;
      if (typeof endDate === 'string' && endDate.trim().length > 0) {
        cleanEndDate = endDate.trim().slice(0, 10);
      }

      if (status === ReviewStatus.SUBMITTED) {
        if ((cleanStartDate && !cleanEndDate) || (!cleanStartDate && cleanEndDate)) {
          throw new BadRequestException('Start date and end date must be provided together.');
        }
        if (cleanStartDate && cleanEndDate && new Date(cleanStartDate).getTime() >= new Date(cleanEndDate).getTime()) {
          throw new BadRequestException('Start date must be before end date.');
        }
      }

      const eligibleUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const cleanProjects = Array.isArray(projects)
        ? projects
        : (typeof projects === 'string' ? this.parseJsonIfNeeded(projects) : (existing?.projects || []));
      const cleanLearningGoals = Array.isArray(learningGoals)
        ? learningGoals
        : (typeof learningGoals === 'string' ? this.parseJsonIfNeeded(learningGoals) : (existing?.learningGoals || []));
      const cleanTeamContribution = Array.isArray(teamContribution)
        ? teamContribution
        : (typeof teamContribution === 'string' ? this.parseJsonIfNeeded(teamContribution) : (existing?.teamContribution || []));

      const resolvedFY = dto.financialYear || this.extractFinancialYear(canonicalQuarter || rawQuarter);

      let review: QuarterlyReview;
      if (existing) {
        existing.quarter = canonicalQuarter || existing.quarter;
        existing.financialYear = resolvedFY || existing.financialYear;
        existing.startDate = cleanStartDate ?? existing.startDate;
        existing.endDate = cleanEndDate ?? existing.endDate;
        existing.overview = overview !== undefined ? overview : existing.overview;
        existing.projects = projects !== undefined ? cleanProjects : existing.projects;
        existing.learningGoals = learningGoals !== undefined ? cleanLearningGoals : existing.learningGoals;
        existing.teamContribution = teamContribution !== undefined ? cleanTeamContribution : existing.teamContribution;
        existing.averageRating = computedAvg !== null ? computedAvg : existing.averageRating;
        existing.companyEnvironment = companyEnvironment !== undefined ? companyEnvironment : existing.companyEnvironment;
        existing.status = status;
        (existing as any).updatedBy = username;
        existing.managerName = activeManagerName || existing.managerName;
        if (assignment) {
          existing.assignmentId = assignment.id;
          existing.deadlineAt = assignment.deadlineAt;
        }

        if (status === ReviewStatus.SUBMITTED) {
          existing.submittedDate = now;
          existing.submissionType = 'MANUAL';
          existing.isReopened = 0;
          existing.accessUntil = null;
          existing.accessRequestEligibleUntil = eligibleUntil;
        }

        review = existing;
      } else {
        review = this.quarterlyReviewRepository.create({
          employeeId,
          quarter: canonicalQuarter || rawQuarter,
          financialYear: resolvedFY || null,
          startDate: cleanStartDate ?? null,
          endDate: cleanEndDate ?? null,
          status,
          overview: overview ?? null,
          projects: cleanProjects,
          learningGoals: cleanLearningGoals,
          teamContribution: cleanTeamContribution,
          averageRating: computedAvg,
          companyEnvironment: companyEnvironment ?? null,
          createdBy: username,
          updatedBy: username,
          managerName: activeManagerName,
          assignmentId: assignment?.id ?? null,
          deadlineAt: assignment?.deadlineAt ?? null,
          submissionType: status === ReviewStatus.SUBMITTED ? 'MANUAL' : null,
          submittedDate: status === ReviewStatus.SUBMITTED ? now : null,
          accessRequestEligibleUntil: status === ReviewStatus.SUBMITTED ? eligibleUntil : null,
          isReopened: 0,
        } as any) as unknown as QuarterlyReview;
      }

      const saved = (await this.quarterlyReviewRepository.save(review as any)) as QuarterlyReview;

      // Clean up orphaned / removed project files from storage when projects are saved/updated
      if (dto.projects !== undefined && saved?.id) {
        try {
          const activeKeys = new Set<string>();
          if (Array.isArray(cleanProjects)) {
            for (const projectItem of cleanProjects) {
              if (projectItem?.attachment) {
                if (Array.isArray(projectItem.attachment)) {
                  for (const attachmentItem of projectItem.attachment) {
                    const documentKey = attachmentItem?.key || attachmentItem?.id || attachmentItem?.s3Key;
                    if (documentKey) activeKeys.add(String(documentKey));
                  }
                } else if (typeof projectItem.attachment === 'object') {
                  const documentKey = projectItem.attachment.key || projectItem.attachment.id || projectItem.attachment.s3Key;
                  if (documentKey) activeKeys.add(String(documentKey));
                }
              }
            }
          }

          const docRepo = this.quarterlyReviewRepository.manager.getRepository(DocumentMetaInfo);
          const reviewDocs = await docRepo.find({
            where: { entityType: EntityType.QUARTERLY_REVIEW, entityId: saved.id },
          });

          for (const doc of reviewDocs) {
            const docKey = String(doc.s3Key || doc.id);
            const docId = String(doc.id);
            if (!activeKeys.has(docKey) && !activeKeys.has(docId)) {
              this.logger.log(`[DOCS] Deleting file '${docKey}' for review ${saved.id} because its project was removed or attachment cleared`);
              await this.documentUploaderService.deleteDoc(docKey).catch(() => null);
            }
          }
        } catch (cleanupErr: any) {
          this.logger.warn(`[DOCS] Error during removed project attachment cleanup: ${cleanupErr.message}`);
        }
      }

      if (status === ReviewStatus.SUBMITTED && assignment) {
        assignment.status = AssignmentStatus.SUBMITTED;
        assignment.isAccessOpen = 0;
        assignment.accessRequestEligibleUntil = eligibleUntil;
        assignment.updatedBy = username;
        await this.assignmentRepository.save(assignment);
      }

      if (status === ReviewStatus.SUBMITTED) {
        setImmediate(async () => {
          try {
            const empRepo = this.quarterlyReviewRepository.manager.getRepository(EmployeeDetails);
            const employee = await empRepo.findOne({ where: { employeeId } });
            const empName = employee?.fullName || username || employeeId;

            // 1. Send in-app notification to Employee
            await this.notificationsService.createNotification({
              employeeId,
              title: 'Quarterly Review Submitted',
              message: `Your quarterly review for ${canonicalQuarter} has been submitted successfully.`,
              type: 'success',
            });

            // 2. Send confirmation email to Employee
            if (employee?.email) {
              try {
                const empSubject = `Quarterly Review Submitted - ${canonicalQuarter}`;
                const empText = `Hello ${empName},\n\nYour quarterly review self-assessment for ${canonicalQuarter} has been submitted successfully and is pending evaluation by your manager.\n\nRegards,\nWorkSphere Appraisal Team`;
                const empHtml = getAppraisalQuarterSubmittedEmployeeTemplate({
                  employeeName: empName,
                  quarter: canonicalQuarter,
                  managerName: activeManagerName || undefined,
                  submittedDate: now,
                });
                await this.mailService.sendMailAsync(employee.email, empSubject, empText, empHtml);
                this.logger.log(`Queued submission confirmation email for employee ${employeeId} (${employee.email})`);
              } catch (empMailErr: any) {
                this.logger.warn(`Could not send submission email to employee: ${empMailErr.message}`);
              }
            }


            // 3. Resolve Manager, Admin, and CEO IDs and Emails
            const candidateManagerIds = new Set<string>();
            const candidateManagerEmails = new Set<string>();

            if (managerMapping?.managerId) {
              candidateManagerIds.add(managerMapping.managerId);
            }
            if (assignment?.assignedById && assignment.assignedById !== employeeId) {
              candidateManagerIds.add(assignment.assignedById);
            }

            if (candidateManagerIds.size > 0) {
              const managers = await empRepo.find({ where: { employeeId: In(Array.from(candidateManagerIds)) } }).catch(() => []);
              for (const mgr of managers) {
                if (mgr.email) candidateManagerEmails.add(mgr.email);
              }
            }

            if (activeManagerName && activeManagerName !== 'CEO & Admin') {
              const mgrByName = await empRepo.findOne({ where: { fullName: activeManagerName } }).catch(() => null);
              if (mgrByName) {
                candidateManagerIds.add(mgrByName.employeeId);
                if (mgrByName.email) candidateManagerEmails.add(mgrByName.email);
              }
            }

            // Resolve all Admin and CEO users
            const adminCeoIds = new Set<string>(['Admin', 'CEO']);
            const adminCeoEmails = new Set<string>();

            try {
              const userRepo = this.quarterlyReviewRepository.manager.getRepository(User);
              const adminCeoUsers = await userRepo.find({
                where: [
                  { userType: UserType.ADMIN },
                  { userType: UserType.CEO },
                  { role: UserType.ADMIN },
                  { role: UserType.CEO },
                ],
              }).catch(() => []);

              for (const u of adminCeoUsers) {
                if (u.loginId && u.loginId !== employeeId) {
                  adminCeoIds.add(u.loginId);
                }
              }

              const adminCeoEmployees = await empRepo.find({
                where: [
                  { designation: Like('%Admin%') },
                  { designation: Like('%CEO%') },
                ],
              }).catch(() => []);

              for (const emp of adminCeoEmployees) {
                if (emp.employeeId && emp.employeeId !== employeeId) {
                  adminCeoIds.add(emp.employeeId);
                  if (emp.email) adminCeoEmails.add(emp.email);
                }
              }

              if (adminCeoIds.size > 0) {
                const extraEmps = await empRepo.find({
                  where: { employeeId: In(Array.from(adminCeoIds)) },
                }).catch(() => []);
                for (const emp of extraEmps) {
                  if (emp.email) adminCeoEmails.add(emp.email);
                }
              }
            } catch (adminErr: any) {
              this.logger.warn(`Could not resolve all Admin/CEO accounts: ${adminErr.message}`);
            }

            // 4. Send in-app notification to Manager(s), Admin(s), and CEO(s)
            const allReviewersToNotify = new Set<string>([...candidateManagerIds, ...adminCeoIds]);
            allReviewersToNotify.delete(employeeId);

            for (const reviewerId of allReviewersToNotify) {
              try {
                await this.notificationsService.createNotification({
                  employeeId: reviewerId,
                  title: 'Quarterly Review Submitted',
                  message: `${empName} has submitted their quarterly review for ${canonicalQuarter}.`,
                  type: 'info',
                });
                this.logger.log(`Created in-app notification for reviewer ${reviewerId} (Admin/CEO/Manager)`);
              } catch (mgrNotifErr: any) {
                this.logger.warn(`Could not create notification for reviewer ${reviewerId}: ${mgrNotifErr.message}`);
              }
            }

            // 5. Send email to Manager(s), Admin(s), and CEO(s)
            const allReviewerEmails = new Set<string>([...candidateManagerEmails, ...adminCeoEmails]);
            for (const revEmail of allReviewerEmails) {
              try {
                const mgrSubject = `Quarterly Review Submitted for Evaluation - ${empName} (${canonicalQuarter})`;
                const mgrText = `Hello,\n\n${empName} has submitted their quarterly self-assessment review for ${canonicalQuarter}.\n\nPlease log in to the Worksphere portal to review and evaluate.\n\nRegards,\nWorkSphere Team`;
                const mgrHtml = getAppraisalQuarterSubmittedManagerTemplate({
                  managerName: activeManagerName || 'Manager / Admin',
                  employeeName: empName,
                  quarter: canonicalQuarter,
                  submittedDate: now,
                });
                await this.mailService.sendMailAsync(revEmail, mgrSubject, mgrText, mgrHtml);
                this.logger.log(`Queued review submission email for reviewer (${revEmail})`);
              } catch (mgrMailErr: any) {
                this.logger.warn(`Could not send review email to reviewer: ${mgrMailErr.message}`);
              }
            }
          } catch (notifErr: any) {
            this.logger.warn(`Could not dispatch submission notification: ${notifErr.message}`);
          }
        });
      }

      (saved as any).assignment = assignment;
      return this.sanitizeReview(saved);
    } catch (error: any) {
      this.logger.error(`Error saving/submitting quarterly review for employee ${employeeId}, quarter ${canonicalQuarter}: ${error.message}`, error.stack);
      const httpStatus = error instanceof HttpException ? error.getStatus() : (typeof error?.getStatus === 'function' ? error.getStatus() : (typeof error?.status === 'number' ? error.status : null));
      if (httpStatus) throw error;
      throw new HttpException(
        `Failed to save/submit quarterly review: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async startEdit(employeeId: string, quarter: string, username: string): Promise<any> {
    const canonicalQuarter = this.normalizeQuarter(quarter);
    let existingReview = await this.quarterlyReviewRepository.findOne({
      where: { employeeId, quarter: canonicalQuarter },
    });

    const assignmentRecord = await this.assignmentRepository.findOne({
      where: { employeeId, quarter: canonicalQuarter },
    });

    if (existingReview) {
      const isAlreadySubmitted =
        existingReview.status === ReviewStatus.SUBMITTED ||
        existingReview.status === ReviewStatus.APPROVED ||
        existingReview.status === ReviewStatus.COMPLETED;

      if (!isAlreadySubmitted && existingReview.status !== ReviewStatus.DRAFT) {
        existingReview.status = ReviewStatus.DRAFT;
        (existingReview as any).updatedBy = username;
        existingReview = await this.quarterlyReviewRepository.save(existingReview);
      }
    } else {
      const resolvedFinancialYear = this.extractFinancialYear(canonicalQuarter);
      const newReviewRecord = this.quarterlyReviewRepository.create({
        employeeId,
        quarter: canonicalQuarter,
        financialYear: resolvedFinancialYear || null,
        status: ReviewStatus.DRAFT,
        createdBy: username,
        updatedBy: username,
        managerName: assignmentRecord?.assignedByName || null,
        assignmentId: assignmentRecord?.id ?? null,
        deadlineAt: assignmentRecord?.deadlineAt ?? null,
      } as any);
      existingReview = (await this.quarterlyReviewRepository.save(newReviewRecord as any)) as QuarterlyReview;
    }

    if (
      assignmentRecord &&
      assignmentRecord.status !== AssignmentStatus.SUBMITTED &&
      assignmentRecord.status !== AssignmentStatus.COMPLETED
    ) {
      assignmentRecord.status = AssignmentStatus.IN_PROGRESS;
      assignmentRecord.updatedBy = username;
      await this.assignmentRepository.save(assignmentRecord);
    }

    (existingReview as any).assignment = assignmentRecord;
    return this.sanitizeReview(existingReview);
  }

  // ─── Document Methods ──────────────────────────────────────────────────────

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
    } catch (error: any) {
      this.logger.error(`[DOCS] Upload failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
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
      const docs = await this.documentUploaderService.getAllDocs(
        entityType,
        entityId,
        referenceType,
        refId,
      );

      if (entityType === EntityType.QUARTERLY_REVIEW && Array.isArray(docs) && docs.length > 0) {
        let review: QuarterlyReview | null = null;
        try {
          review = await this.quarterlyReviewRepository.findOne({ where: { id: entityId } });
        } catch {
          review = null;
        }

        if (!review) {
          for (const d of docs) {
            await this.documentUploaderService.deleteDoc(d.key || (d as any).id).catch(() => null);
          }
          return [];
        }

        let projects = this.parseJsonIfNeeded(review.projects);
        if (!Array.isArray(projects)) projects = [];

        // If review has 0 projects in DB, all files for this review are orphans from removed projects
        if (projects.length === 0) {
          this.logger.log(`[DOCS] Review ${entityId} has 0 projects in DB. Deleting orphaned files for refId ${refId}`);
          for (const d of docs) {
            await this.documentUploaderService.deleteDoc(d.key || (d as any).id).catch(() => null);
          }
          return [];
        }

        // If refId is greater than number of projects, this project was removed
        if (refId && refId > projects.length) {
          this.logger.log(`[DOCS] refId ${refId} > projects.length (${projects.length}). Deleting files for removed project`);
          for (const d of docs) {
            await this.documentUploaderService.deleteDoc(d.key || (d as any).id).catch(() => null);
          }
          return [];
        }

        const reviewCreatedAt = (review as any).createdAt ? new Date((review as any).createdAt).getTime() : 0;
        const validDocs: any[] = [];

        for (const d of docs) {
          const docCreatedAt = d.createdAt ? new Date(d.createdAt).getTime() : 0;
          if (reviewCreatedAt > 0 && docCreatedAt > 0 && docCreatedAt < (reviewCreatedAt - 60000)) {
            this.logger.warn(
              `[DOCS] Deleting stale orphaned document '${d.key}' created at ${d.createdAt} for review ${entityId} created at ${(review as any).createdAt}`,
            );
            await this.documentUploaderService.deleteDoc(d.key || (d as any).id).catch(() => null);
          } else {
            validDocs.push(d);
          }
        }
        return validDocs;
      }

      return docs;
    } catch (error: any) {
      this.logger.error(`[DOCS] Failed to get files: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to fetch documents',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteProjectFiles(
    entityType: EntityType,
    entityId: number,
    refId: number,
  ) {
    this.logger.log(`[DOCS] Deleting all files for entityType=${entityType}, entityId=${entityId}, refId=${refId}`);
    try {
      const docRepo = this.quarterlyReviewRepository.manager.getRepository(DocumentMetaInfo);
      const docs = await docRepo.find({
        where: {
          entityType: entityType || EntityType.QUARTERLY_REVIEW,
          entityId,
          refId,
        },
      });

      for (const d of docs) {
        const key = d.s3Key || d.id;
        await this.documentUploaderService.deleteDoc(key).catch(() => null);
      }

      // Also clean up attachment reference inside review.projects JSON if applicable
      if (entityId && !isNaN(entityId)) {
        try {
          const review = await this.quarterlyReviewRepository.findOne({ where: { id: entityId } });
          if (review && review.projects) {
            let projects = this.parseJsonIfNeeded(review.projects);
            if (Array.isArray(projects)) {
              let updated = false;
              projects = projects.map((proj: any, idx: number) => {
                const projectRefId = proj.id != null ? Number(proj.id) : idx + 1;
                if (projectRefId === refId || refId === idx + 1) {
                  if (proj.attachment) {
                    proj.attachment = null;
                    updated = true;
                  }
                }
                return proj;
              });

              if (updated) {
                review.projects = projects;
                await this.quarterlyReviewRepository.save(review);
                this.logger.log(`[DOCS] Cleared attachment for refId=${refId} in review id=${entityId} projects JSON`);
              }
            }
          }
        } catch (syncErr: any) {
          this.logger.warn(`[DOCS] Could not sync project attachment removal: ${syncErr.message}`);
        }
      }

      return {
        success: true,
        message: 'All files for project deleted successfully',
      };
    } catch (error: any) {
      this.logger.error(`[DOCS] Error deleting project files: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to delete project files', HttpStatus.INTERNAL_SERVER_ERROR);
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

      // Also clean up attachment reference inside the QuarterlyReview entity's projects JSON if applicable
      if (entityId && !isNaN(entityId)) {
        try {
          const review = await this.quarterlyReviewRepository.findOne({ where: { id: entityId } });
          if (review && review.projects) {
            let projects = this.parseJsonIfNeeded(review.projects);
            if (Array.isArray(projects)) {
              let updated = false;
              projects = projects.map((proj: any, idx: number) => {
                const projectRefId = proj.id != null ? Number(proj.id) : idx + 1;
                if (projectRefId === refId || !refId || refId === idx + 1) {
                  if (Array.isArray(proj.attachment)) {
                    const beforeLen = proj.attachment.length;
                    proj.attachment = proj.attachment.filter(
                      (att: any) =>
                        att?.key !== key &&
                        att?.id !== key &&
                        att?.s3Key !== key &&
                        att?.name !== key,
                    );
                    if (proj.attachment.length !== beforeLen) updated = true;
                    if (proj.attachment.length === 0) proj.attachment = null;
                  } else if (
                    proj.attachment &&
                    (proj.attachment.key === key ||
                      proj.attachment.id === key ||
                      proj.attachment.s3Key === key ||
                      proj.attachment.name === key)
                  ) {
                    proj.attachment = null;
                    updated = true;
                  }
                }
                return proj;
              });

              if (updated) {
                review.projects = projects;
                await this.quarterlyReviewRepository.save(review);
                this.logger.log(`[DOCS] Cleaned up attachment '${key}' from review id=${entityId} projects JSON`);
              }
            }
          }
        } catch (syncErr: any) {
          this.logger.warn(`[DOCS] Could not sync deleted document from review projects: ${syncErr.message}`);
        }
      }

      return {
        success: true,
        message: 'Document deleted successfully',
      };
    } catch (error: any) {
      this.logger.error(`[DOCS] Delete failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Error deleting document',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── Withdraw / Delete ─────────────────────────────────────────────────────

  async deleteOrWithdraw(employeeId: string, idOrQuarter: number | string): Promise<{ success: boolean; message: string; data?: any }> {
    this.logger.log(`[deleteOrWithdraw] employeeId='${employeeId}', idOrQuarter='${idOrQuarter}'`);
    try {
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
    } catch (error: any) {
      this.logger.error(`[deleteOrWithdraw] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to withdraw quarterly review',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── PDF Generation ────────────────────────────────────────────────────────

  async generateQuarterlyReviewPdf(
    employeeId: string,
    idOrQuarter: number | string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    this.logger.log(`[PDF] Generating Quarterly Review PDF for ${employeeId}, id/quarter='${idOrQuarter}'`);
    try {
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
            teamContrib.forEach((contributionItem: any) => {
              const categoryTitle = contributionItem.category || 'Competency';
              const formattedRating = contributionItem.rating != null ? `${contributionItem.rating} / 5` : '—';
              doc.fillColor(darkText).fontSize(8.5).font('Helvetica-Bold').text(categoryTitle, 48, doc.y, { width: 320 });
              doc.fillColor(primaryIndigo).fontSize(8.5).font('Helvetica-Bold').text(formattedRating, 400, doc.y - 10, { width: 100, align: 'right' });
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
    } catch (error: any) {
      this.logger.error(`[PDF] Error generating PDF for ${employeeId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to generate quarterly review PDF',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── Access Request Methods ────────────────────────────────────────────────

  async requestAccess(
    employeeId: string,
    quarter: string,
    reason: string,
    userRole: string,
    username: string,
    assignmentId?: number,
  ): Promise<any> {
    const canonicalQuarter = this.normalizeQuarter(quarter);
    this.logger.log(`[requestAccess] employeeId='${employeeId}', quarter='${canonicalQuarter}', role='${userRole}'`);
    try {
      const rawQuarter = typeof quarter === 'string' ? quarter.trim() : '';
      const assignment = await this.assignmentRepository.findOne({
        where: assignmentId
          ? [{ id: assignmentId }]
          : [
            { employeeId, quarter: canonicalQuarter },
            { employeeId, quarter: rawQuarter },
            { employeeId, quarter: canonicalQuarter.replace('FY', 'FY ') },
            { employeeId, quarter: canonicalQuarter.replace('FY ', 'FY') },
          ],
        order: { id: 'DESC' },
      });

      const review = await this.quarterlyReviewRepository.findOne({
        where: [
          { employeeId, quarter: canonicalQuarter },
          { employeeId, quarter: rawQuarter },
          { employeeId, quarter: canonicalQuarter.replace('FY', 'FY ') },
          { employeeId, quarter: canonicalQuarter.replace('FY ', 'FY') },
        ],
      });

      const now = new Date();
      const eligibleUntil = assignment?.accessRequestEligibleUntil || review?.accessRequestEligibleUntil;
      if (eligibleUntil && now > new Date(eligibleUntil)) {
        throw new BadRequestException(`The 24-hour window to request access for ${canonicalQuarter} has expired.`);
      }

      const existingPendingRequest = await this.accessRequestRepository.findOne({
        where: [
          { employeeId, quarter: canonicalQuarter, status: AccessRequestStatus.PENDING },
          { employeeId, quarter: rawQuarter, status: AccessRequestStatus.PENDING },
          { employeeId, quarter: canonicalQuarter.replace('FY', 'FY '), status: AccessRequestStatus.PENDING },
          { employeeId, quarter: canonicalQuarter.replace('FY ', 'FY'), status: AccessRequestStatus.PENDING },
        ],
      });

      if (existingPendingRequest) {
        throw new BadRequestException(`An access request for ${canonicalQuarter} is already pending approval.`);
      }

      const managerMapping = await this.quarterlyReviewRepository.manager
        .getRepository(ManagerMapping)
        .findOne({
          where: { employeeId, status: ManagerMappingStatus.ACTIVE },
        });

      const activeManagerName = managerMapping ? managerMapping.managerName : 'CEO & Admin';
      const employeeRepo = this.quarterlyReviewRepository.manager.getRepository(EmployeeDetails);
      const employeeDetails = await employeeRepo.findOne({ where: { employeeId } });
      const employeeName = employeeDetails?.fullName || username || employeeId;

      const newRequest = this.accessRequestRepository.create({
        employeeId,
        employeeName,
        quarter: canonicalQuarter,
        userRole: userRole || 'EMPLOYEE',
        reason: reason || null,
        status: AccessRequestStatus.PENDING,
        managerName: activeManagerName,
        assignmentId: assignment?.id || null,
        requestedAt: now,
        createdBy: username,
        updatedBy: username,
      });

      const savedRequest = await this.accessRequestRepository.save(newRequest);

      try {
        if (managerMapping?.managerId) {
          await this.notificationsService.createNotification({
            employeeId: managerMapping.managerId,
            title: 'Quarterly Review Access Requested',
            message: `${employeeName} has requested access to edit their ${canonicalQuarter} review. Reason: ${reason || 'None provided'}`,
            type: 'alert',
          });
        }
      } catch (reqNotifErr: any) {
        this.logger.warn(`Could not dispatch access request notification: ${reqNotifErr.message}`);
      }

      return {
        success: true,
        message: `Access request for ${canonicalQuarter} submitted successfully. Pending approval.`,
        data: savedRequest,
      };
    } catch (error: any) {
      this.logger.error(`[requestAccess] Error: ${error.message}`, error.stack);
      const httpStatus = error instanceof HttpException ? error.getStatus() : (typeof error?.getStatus === 'function' ? error.getStatus() : (typeof error?.status === 'number' ? error.status : null));
      if (httpStatus) throw error;
      throw new HttpException(
        error.message || 'Failed to submit access request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAccessRequests(
    viewerId: string,
    viewerRole: string,
    viewerName: string,
    quarterFilter?: string,
  ): Promise<any[]> {
    this.logger.log(`[getAccessRequests] viewerId='${viewerId}', role='${viewerRole}', name='${viewerName}'`);
    try {
      const isPrivileged = viewerRole === 'ADMIN' || viewerRole === 'CEO';

      let requests: QuarterlyReviewAccessRequest[] = [];

      if (isPrivileged) {
        const query = this.accessRequestRepository.createQueryBuilder('request').orderBy('request.id', 'DESC');
        if (quarterFilter) {
          query.andWhere('request.quarter LIKE :quarterFilter', { quarterFilter: `%${quarterFilter}%` });
        }
        requests = await query.getMany();
      } else if (viewerRole === 'MANAGER') {
        const mappingRepo = this.quarterlyReviewRepository.manager.getRepository(ManagerMapping);
        const teamMappings = await mappingRepo.find({
          where: [
            { managerId: viewerId, status: ManagerMappingStatus.ACTIVE },
            { managerName: viewerName, status: ManagerMappingStatus.ACTIVE },
          ],
        });
        const teamEmployeeIds = teamMappings
          .map((mapping) => mapping.employeeId)
          .filter((empId) => empId !== viewerId);

        if (teamEmployeeIds.length === 0) {
          return [];
        }

        const query = this.accessRequestRepository.createQueryBuilder('request')
          .where('request.employeeId IN (:...teamEmployeeIds)', { teamEmployeeIds })
          .andWhere('request.employeeId != :viewerId', { viewerId })
          .orderBy('request.id', 'DESC');

        if (quarterFilter) {
          query.andWhere('request.quarter LIKE :quarterFilter', { quarterFilter: `%${quarterFilter}%` });
        }
        requests = await query.getMany();
      } else {
        requests = await this.accessRequestRepository.find({
          where: { employeeId: viewerId },
          order: { id: 'DESC' },
        });
      }

      return requests;
    } catch (error: any) {
      this.logger.error(`[getAccessRequests] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to fetch access requests',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async actionAccessRequest(
    requestId: number,
    approverUser: any,
    dto: ActionAccessRequestDto,
  ): Promise<any> {
    const approverId = approverUser?.loginId;
    const approverName = approverUser?.aliasLoginName || approverUser?.userName || approverId;
    const approverRole = this.getUserRole(approverUser);
    this.logger.log(`[actionAccessRequest] requestId=${requestId}, approverId='${approverId}', action='${dto.action}'`);
    try {
      const request = await this.accessRequestRepository.findOne({ where: { id: requestId } });
      if (!request) {
        throw new NotFoundException(`Access request with ID ${requestId} not found.`);
      }

      if (request.status !== AccessRequestStatus.PENDING) {
        throw new BadRequestException(`Access request has already been ${request.status.toLowerCase()}.`);
      }

      if (approverId === request.employeeId) {
        throw new ForbiddenException('Managers and employees cannot approve their own access requests.');
      }

      const isPrivileged = approverRole === 'ADMIN' || approverRole === 'CEO';
      if (request.userRole === 'MANAGER' && !isPrivileged) {
        throw new ForbiddenException('Only Admin or CEO can action access requests for managers.');
      }

      const now = new Date();

      if (dto.action === 'APPROVE') {
        const extensionHours = Number(dto.extensionHours) || 48;
        const accessUntil = new Date(now.getTime() + extensionHours * 60 * 60 * 1000);

        request.status = AccessRequestStatus.APPROVED;
        request.approvedById = approverId;
        request.approvedByName = approverName;
        request.approvedByRole = approverRole;
        request.approvedAt = now;
        request.accessUntil = accessUntil;
        request.actionedById = approverId;
        request.actionedByName = approverName;
        request.actionedAt = now;
        request.extensionDeadline = accessUntil;
        request.remarks = dto.remarks || `Approved with ${extensionHours}h extension.`;
        request.updatedBy = approverName;
        await this.accessRequestRepository.save(request);

        const assignment = await this.assignmentRepository.findOne({
          where: [
            { employeeId: request.employeeId, quarter: request.quarter },
            { employeeId: request.employeeId, quarter: this.normalizeQuarter(request.quarter) },
          ],
          order: { id: 'DESC' },
        });

        if (assignment) {
          assignment.isAccessOpen = 1;
          assignment.deadlineAt = accessUntil;
          assignment.status = AssignmentStatus.IN_PROGRESS;
          assignment.updatedBy = approverName;
          await this.assignmentRepository.save(assignment);
        }

        let review = await this.quarterlyReviewRepository.findOne({
          where: [
            { employeeId: request.employeeId, quarter: request.quarter },
            { employeeId: request.employeeId, quarter: this.normalizeQuarter(request.quarter) },
          ],
        });

        if (review) {
          review.status = ReviewStatus.DRAFT;
          review.accessUntil = accessUntil;
          review.deadlineAt = accessUntil;
          review.isReopened = 1;
          review.autoSubmitted = 0;
          review.updatedBy = approverName;
          await this.quarterlyReviewRepository.save(review);
        } else {
          review = this.quarterlyReviewRepository.create({
            employeeId: request.employeeId,
            quarter: request.quarter,
            status: ReviewStatus.DRAFT,
            accessUntil,
            deadlineAt: accessUntil,
            isReopened: 1,
            autoSubmitted: 0,
            createdBy: approverName,
            updatedBy: approverName,
          } as any) as unknown as QuarterlyReview;
          await this.quarterlyReviewRepository.save(review as any);
        }

        try {
          await this.notificationsService.createNotification({
            employeeId: request.employeeId,
            title: `Access Request Approved: ${request.quarter}`,
            message: `Your access request for ${request.quarter} was approved by ${approverName} (${approverRole}). Review reopened until ${accessUntil.toLocaleDateString('en-IN')} ${accessUntil.toLocaleTimeString('en-IN')}.`,
            type: 'info',
          });
          const empRepo = this.quarterlyReviewRepository.manager.getRepository(EmployeeDetails);
          const employee = await empRepo.findOne({ where: { employeeId: request.employeeId } });
          if (employee?.email) {
            await this.mailService.sendMailAsync(
              employee.email,
              `Access Request Approved: ${request.quarter}`,
              `Hello ${employee.fullName || 'Employee'},\n\nYour request to reopen the ${request.quarter} review has been approved.\nAccess is granted until: ${accessUntil.toLocaleDateString('en-IN')} ${accessUntil.toLocaleTimeString('en-IN')}.\n\nRemarks: ${dto.remarks || 'None'}\n\nRegards,\nWorkSphere Performance Team`
            );
          }
        } catch (notifErr: any) {
          this.logger.warn(`Could not dispatch approval notification: ${notifErr.message}`);
        }

        return {
          success: true,
          message: `Access request approved. Review reopened for ${extensionHours} hours.`,
          data: request,
        };
      } else {
        request.status = AccessRequestStatus.REJECTED;
        request.rejectedById = approverId;
        request.rejectedByName = approverName;
        request.rejectedAt = now;
        request.actionedById = approverId;
        request.actionedByName = approverName;
        request.actionedAt = now;
        request.rejectionReason = dto.remarks || 'Access request rejected.';
        request.remarks = dto.remarks || 'Access request rejected.';
        request.updatedBy = approverName;
        await this.accessRequestRepository.save(request);

        try {
          await this.notificationsService.createNotification({
            employeeId: request.employeeId,
            title: `Access Request Rejected: ${request.quarter}`,
            message: `Your access request for ${request.quarter} was rejected by ${approverName} (${approverRole}). Reason: ${dto.remarks || 'None specified'}`,
            type: 'alert',
          });
        } catch (notifErr: any) {
          this.logger.warn(`Could not dispatch rejection notification: ${notifErr.message}`);
        }

        return {
          success: true,
          message: 'Access request rejected.',
          data: request,
        };
      }
    } catch (error: any) {
      this.logger.error(`[actionAccessRequest] Error for requestId=${requestId}: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to action access request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async approveAccessRequest(
    requestId: number,
    approverId: string,
    approverName: string,
    approverRole: string,
  ): Promise<any> {
    try {
      return await this.actionAccessRequest(
        requestId,
        { loginId: approverId, aliasLoginName: approverName, role: approverRole },
        { action: 'APPROVE', extensionHours: 48 },
      );
    } catch (error: any) {
      this.logger.error(`[approveAccessRequest] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to approve access request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async rejectAccessRequest(
    requestId: number,
    approverId: string,
    approverName: string,
    approverRole: string,
    rejectionReason?: string,
  ): Promise<any> {
    try {
      return await this.actionAccessRequest(
        requestId,
        { loginId: approverId, aliasLoginName: approverName, role: approverRole },
        { action: 'REJECT', remarks: rejectionReason },
      );
    } catch (error: any) {
      this.logger.error(`[rejectAccessRequest] Error: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to reject access request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
