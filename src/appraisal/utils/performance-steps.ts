import { EmployeePerformance } from '../entities/employee_performance.entity';
import {
  PerformanceProject,
  StepAchievements,
  StepEnvironment,
  StepFinalReview,
  StepLearning,
  StepOverview,
  StepTeamwork,
} from '../interfaces/employee_performance.interface';

const OVERVIEW_KEYS: (keyof StepOverview)[] = [
  'overallPerformanceSummary',
  'keyHighlights',
  'majorContributions',
  'areasForImprovement',
  'reviewPeriodStart',
  'reviewPeriodEnd',
];

const TEAMWORK_KEYS: (keyof StepTeamwork)[] = [
  'teamCollaborationSummary',
  'crossTeamContributions',
  'knowledgeSharingMentoring',
  'teamworkExamples',
  'teamRatings',
  'communicationDescription',
  'ownershipDescription',
  'collaborationDescription',
  'problemSolvingDescription',
  'leadershipDescription',
  'adaptabilityDescription',
];

const LEARNING_KEYS: (keyof StepLearning)[] = [
  'skillsAcquired',
  'certificationsOrCourses',
  'skillsToImprove',
  'supportOrTrainingRequired',
  'nextQuarterLearningGoals',
];

const ENVIRONMENT_KEYS: (keyof StepEnvironment)[] = [
  'workEnvironmentRating',
  'toolsResourcesRating',
  'managerSupportRating',
  'challengesAffectingProductivity',
  'feedbackOnWorkCulture',
  'workLifeBalance',
  'suggestionsForImprovement',
  'rateCompanyEnvironment',
];

const FINAL_KEYS: (keyof StepFinalReview)[] = [
  'overallSelfRating',
  'overallEmployeeComments',
  'careerGrowthInterests',
  'confirmationAccepted',
];

/** Saves only the step JSON that was sent. */
export function readPerformanceProjects(record: { stepAchievements?: StepAchievements | null }): PerformanceProject[] {
  return record.stepAchievements?.projects || [];
}

export function savePerformanceProjects(record: EmployeePerformance, projects: PerformanceProject[]): void {
  record.stepAchievements = { projects };
}

export function applyPerformanceSteps(record: EmployeePerformance, dto: Record<string, unknown>): void {
  if (dto.stepOverview !== undefined) {
    record.stepOverview = (dto.stepOverview as StepOverview) || null;
  }
  if (dto.stepAchievements !== undefined) {
    record.stepAchievements = (dto.stepAchievements as StepAchievements) || null;
  } else if (dto.projects !== undefined && dto.projects !== null) {
    savePerformanceProjects(record, dto.projects as PerformanceProject[]);
  }
  if (dto.stepTeamwork !== undefined) {
    record.stepTeamwork = (dto.stepTeamwork as StepTeamwork) || null;
  }
  if (dto.stepLearning !== undefined) {
    record.stepLearning = (dto.stepLearning as StepLearning) || null;
  }
  if (dto.stepEnvironment !== undefined) {
    record.stepEnvironment = (dto.stepEnvironment as StepEnvironment) || null;
  }
  if (dto.stepFinalReview !== undefined) {
    record.stepFinalReview = (dto.stepFinalReview as StepFinalReview) || null;
  }
}

export function clearPerformanceSteps(record: EmployeePerformance): void {
  record.stepOverview = null;
  record.stepAchievements = null;
  record.stepTeamwork = null;
  record.stepLearning = null;
  record.stepEnvironment = null;
  record.stepFinalReview = null;
}

function copyDefined(target: Record<string, unknown>, source: object | null | undefined, keys: string[]) {
  if (!source) {
    return;
  }
  const record = source as Record<string, unknown>;
  keys.forEach((key) => {
    if (record[key] !== undefined) {
      target[key] = record[key];
    }
  });
}

/** Copy JSON steps onto the response fields the screens already read. Does not mutate the saved row. */
export function overlayPerformanceView<T extends object>(record: T): T {
  const view = { ...record } as T & Record<string, unknown>;
  copyDefined(view, view.stepOverview as object | null, OVERVIEW_KEYS as string[]);
  copyDefined(view, view.stepTeamwork as object | null, TEAMWORK_KEYS as string[]);
  copyDefined(view, view.stepLearning as object | null, LEARNING_KEYS as string[]);
  copyDefined(view, view.stepEnvironment as object | null, ENVIRONMENT_KEYS as string[]);
  copyDefined(view, view.stepFinalReview as object | null, FINAL_KEYS as string[]);
  return view;
}

export function stepText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = (value || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}
