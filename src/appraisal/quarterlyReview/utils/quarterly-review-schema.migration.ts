import { DataSource, In, IsNull, Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { QuarterlyReview } from '../entities/quarterly-review.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { AppraisalReviewStatus, AssignmentStatus } from '../enums/quarterly-review.enum';


const migrationLogger = new Logger('QuarterlyReviewSchemaMigration');

// ── Legacy → Canonical status maps ──────────────────────────────────────────

/** Maps any legacy `review_status` string → canonical AppraisalReviewStatus */
const LEGACY_REVIEW_STATUS_MAP: Record<string, AppraisalReviewStatus> = {
  Completed: AppraisalReviewStatus.REVIEWED,
  completed: AppraisalReviewStatus.REVIEWED,
  Approved: AppraisalReviewStatus.REVIEWED,
  approved: AppraisalReviewStatus.REVIEWED,
  'In Review': AppraisalReviewStatus.UNDER_REVIEW,
  'in review': AppraisalReviewStatus.UNDER_REVIEW,
  'under review': AppraisalReviewStatus.UNDER_REVIEW,
  Draft: AppraisalReviewStatus.UNDER_REVIEW,
  draft: AppraisalReviewStatus.UNDER_REVIEW,
  Pending: AppraisalReviewStatus.AWAITING_REVIEW,
  pending: AppraisalReviewStatus.AWAITING_REVIEW,
  Submitted: AppraisalReviewStatus.AWAITING_REVIEW,
  submitted: AppraisalReviewStatus.AWAITING_REVIEW,
  'Auto Submitted': AppraisalReviewStatus.AWAITING_REVIEW,
  'auto submitted': AppraisalReviewStatus.AWAITING_REVIEW,
  awaiting_review: AppraisalReviewStatus.AWAITING_REVIEW,
  'Not Started': AppraisalReviewStatus.ASSIGNED,
  'not started': AppraisalReviewStatus.ASSIGNED,
};

/** Maps any legacy assignment `status` string → canonical AssignmentStatus */
const LEGACY_ASSIGNMENT_STATUS_MAP: Record<string, AssignmentStatus> = {
  COMPLETED: AssignmentStatus.REVIEWED,
  Completed: AssignmentStatus.REVIEWED,
  APPROVED: AssignmentStatus.REVIEWED,
  Approved: AssignmentStatus.REVIEWED,
  Reviewed: AssignmentStatus.REVIEWED,
  IN_REVIEW: AssignmentStatus.UNDER_REVIEW,
  'In Review': AssignmentStatus.UNDER_REVIEW,
  'Under Review': AssignmentStatus.UNDER_REVIEW,
  IN_PROGRESS: AssignmentStatus.UNDER_REVIEW,
  SUBMITTED: AssignmentStatus.AWAITING_REVIEW,
  Submitted: AssignmentStatus.AWAITING_REVIEW,
  AUTO_SUBMITTED: AssignmentStatus.AWAITING_REVIEW,
  'Auto Submitted': AssignmentStatus.AWAITING_REVIEW,
  PENDING: AssignmentStatus.AWAITING_REVIEW,
  Pending: AssignmentStatus.AWAITING_REVIEW,
  DRAFT: AssignmentStatus.ASSIGNED,
  Draft: AssignmentStatus.ASSIGNED,
  NOT_STARTED: AssignmentStatus.ASSIGNED,
  'Not Started': AssignmentStatus.ASSIGNED,
};

// ── Helper ────────────────────────────────────────────────────────────────────

/** Saves entities in batches to avoid oversized UPDATE statements. */
async function saveBatch(repo: Repository<any>, items: any[], batchSize = 50): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await repo.save(items.slice(i, i + batchSize) as any);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runQuarterlyReviewSchemaMigration(dataSource: DataSource): Promise<void> {
  try {
    const reviewRepo = dataSource.getRepository(QuarterlyReview);
    const assignmentRepo = dataSource.getRepository(ReviewAssignment);

    // ── 1. Normalize legacy review_status values in quarterly_reviews ─────────
    try {
      const legacyReviewStatuses = Object.keys(LEGACY_REVIEW_STATUS_MAP);
      const staleReviews = await reviewRepo.find({
        where: { reviewStatus: In(legacyReviewStatuses) as any },
        select: ['id', 'reviewStatus', 'status'],
      });

      if (staleReviews.length > 0) {
        const toUpdate = staleReviews.map((review) =>
          Object.assign(review, {
            reviewStatus: LEGACY_REVIEW_STATUS_MAP[review.reviewStatus as string],
          }),
        );
        await saveBatch(reviewRepo, toUpdate);
        migrationLogger.log(`Normalized ${toUpdate.length} legacy review_status values in quarterly_reviews`);
      }
    } catch (err: any) {
      migrationLogger.debug(`review_status normalization skipped: ${err.message}`);
    }

    // ── 2. Normalize legacy status values in review_assignments ──────────────
    try {
      const legacyAssignmentStatuses = Object.keys(LEGACY_ASSIGNMENT_STATUS_MAP);
      const staleAssignments = await assignmentRepo.find({
        where: { status: In(legacyAssignmentStatuses) as any },
        select: ['id', 'status'],
      });

      if (staleAssignments.length > 0) {
        const toUpdate = staleAssignments.map((assignment) =>
          Object.assign(assignment, {
            status: LEGACY_ASSIGNMENT_STATUS_MAP[assignment.status as string],
          }),
        );
        await saveBatch(assignmentRepo, toUpdate);
        migrationLogger.log(`Normalized ${toUpdate.length} legacy status values in review_assignments`);
      }
    } catch (err: any) {
      migrationLogger.debug(`assignment status normalization skipped: ${err.message}`);
    }

    // ── 3. Backfill quarterly_reviews from linked review_assignments ──────────
    // Copies assignedAt / deadlineAt / financialYear / notes from the assignment
    // row when the review row is missing those values.
    try {
      const reviewsMissingMeta = await reviewRepo.find({
        where: [{ assignedAt: IsNull() }, { deadlineAt: IsNull() }],
        select: ['id', 'employeeId', 'quarter', 'assignmentId', 'assignedAt', 'deadlineAt', 'financialYear', 'notes'],
      });

      if (reviewsMissingMeta.length > 0) {
        const assignmentIds = [...new Set(
          reviewsMissingMeta.map((r) => r.assignmentId).filter((id): id is number => id != null),
        )];

        const assignments = assignmentIds.length > 0
          ? await assignmentRepo.find({
            where: { id: In(assignmentIds) },
            select: ['id', 'employeeId', 'quarter', 'assignedAt', 'deadlineAt', 'financialYear', 'notes'],
          })
          : [];

        const assignmentById = new Map(assignments.map((a) => [a.id, a]));

        const toUpdate: QuarterlyReview[] = [];
        for (const review of reviewsMissingMeta) {
          const linked = review.assignmentId != null
            ? assignmentById.get(review.assignmentId)
            : assignments.find((a) => a.employeeId === review.employeeId && a.quarter === review.quarter);

          if (!linked) continue;

          let changed = false;
          if (!review.assignedAt && linked.assignedAt) { review.assignedAt = linked.assignedAt; changed = true; }
          if (!review.deadlineAt && linked.deadlineAt) { review.deadlineAt = linked.deadlineAt; changed = true; }
          if (!review.financialYear && linked.financialYear) { review.financialYear = linked.financialYear; changed = true; }
          if (!review.notes && linked.notes) { review.notes = linked.notes; changed = true; }

          if (changed) toUpdate.push(review);
        }

        if (toUpdate.length > 0) {
          await saveBatch(reviewRepo, toUpdate);
          migrationLogger.log(`Backfilled metadata for ${toUpdate.length} quarterly_reviews from review_assignments`);
        }
      }
    } catch (err: any) {
      migrationLogger.debug(`Backfill skipped: ${err.message}`);
    }
  } catch (err: any) {
    migrationLogger.warn(`Schema migration check: ${err.message}`);
  }
}

