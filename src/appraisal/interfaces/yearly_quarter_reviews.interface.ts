import { QuaterlyEnum } from '../enums/quarterly_review.enums';

export interface YearlyQuarterPerformanceSnapshot {
  id: number | null;
  status: string | null;
  submittedAt: Date | string | null;
  stepOverview: unknown;
  stepAchievements: unknown;
  stepTeamwork: unknown;
  stepLearning: unknown;
  stepEnvironment: unknown;
  stepFinalReview: unknown;
}

export interface YearlyQuarterReviewSnapshot {
  id: number | null;
  quarter: QuaterlyEnum;
  reviewPeriod: string;
  status: string | null;
  assignedDate: Date | string | null;
  deadlineDate: Date | string | null;
  submittedDate: Date | string | null;
  reviewedDate: Date | string | null;
  productivity: number | null;
  qualityOfWork: number | null;
  technicalJobSkills: number | null;
  ownershipResponsibility: number | null;
  communication: number | null;
  teamCollaboration: number | null;
  innovationProblemSolving: number | null;
  overallPerformanceRating: number | null;
  finalRating: number | null;
  ratingDescription: string | null;
  performanceStrengths: string | null;
  areasOfImprovement: string | null;
  managerComment: string | null;
  goalsForNextReviewPeriod: string | null;
  careerGrowthRecommendation: string | null;
  reviewOutcome: string | null;
  performanceAction: string | null;
  managerConfirmation: boolean;
  assignerConfirmation: boolean;
  description: string | null;
  performanceId: number | null;
  performance: YearlyQuarterPerformanceSnapshot | null;
}

export interface YearlyQuarterReviews {
  Q1: YearlyQuarterReviewSnapshot | null;
  Q2: YearlyQuarterReviewSnapshot | null;
  Q3: YearlyQuarterReviewSnapshot | null;
  Q4: YearlyQuarterReviewSnapshot | null;
}
