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

export type PerformanceStepSlug =
  | 'overview'
  | 'achievements'
  | 'teamwork'
  | 'learning'
  | 'environment'
  | 'final-review';

export const PERFORMANCE_STEP_SLUGS: PerformanceStepSlug[] = [
  'overview',
  'achievements',
  'teamwork',
  'learning',
  'environment',
  'final-review',
];

/** Saves only the step JSON that was sent. */
export function readPerformanceProjects(record: { stepAchievements?: StepAchievements | null }): PerformanceProject[] {
  return record.stepAchievements?.projects || [];
}

export function savePerformanceProjects(record: EmployeePerformance, projects: PerformanceProject[]): void {
  record.stepAchievements = { projects };
}

/** Merge only defined keys from patch into existing step JSON (PATCH semantics). */
export function mergeStepPatch<T extends object>(
  existing: T | null | undefined,
  patch: Partial<T> | Record<string, unknown>,
): T {
  const next = { ...(existing || {}) } as Record<string, unknown>;
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      next[key] = value;
    }
  });
  return next as T;
}

export function readStepData(
  record: EmployeePerformance,
  step: PerformanceStepSlug,
): StepOverview | StepAchievements | StepTeamwork | StepLearning | StepEnvironment | StepFinalReview | null {
  switch (step) {
    case 'overview':
      return record.stepOverview ?? null;
    case 'achievements':
      return record.stepAchievements ?? null;
    case 'teamwork':
      return record.stepTeamwork ?? null;
    case 'learning':
      return record.stepLearning ?? null;
    case 'environment':
      return record.stepEnvironment ?? null;
    case 'final-review':
      return record.stepFinalReview ?? null;
    default:
      return null;
  }
}

/** Keep only known keys for a step so PATCH cannot write other steps into this JSON. */
function pickStepKeys(
  patch: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  keys.forEach((key) => {
    if (patch[key] !== undefined) {
      next[key] = patch[key];
    }
  });
  return next;
}

/** Apply a partial step PATCH onto the matching JSON column. */
export function applyStepPatch(
  record: EmployeePerformance,
  step: PerformanceStepSlug,
  patch: Record<string, unknown>,
): void {
  switch (step) {
    case 'overview':
      record.stepOverview = mergeStepPatch(
        record.stepOverview,
        pickStepKeys(patch, OVERVIEW_KEYS as string[]),
      );
      break;
    case 'achievements':
      if (patch.projects !== undefined) {
        savePerformanceProjects(record, (patch.projects as PerformanceProject[]) || []);
      } else {
        record.stepAchievements = mergeStepPatch(record.stepAchievements, patch);
      }
      break;
    case 'teamwork':
      record.stepTeamwork = mergeStepPatch(
        record.stepTeamwork,
        pickStepKeys(patch, TEAMWORK_KEYS as string[]),
      );
      break;
    case 'learning':
      record.stepLearning = mergeStepPatch(
        record.stepLearning,
        pickStepKeys(patch, LEARNING_KEYS as string[]),
      );
      break;
    case 'environment':
      record.stepEnvironment = mergeStepPatch(
        record.stepEnvironment,
        pickStepKeys(patch, ENVIRONMENT_KEYS as string[]),
      );
      break;
    case 'final-review':
      // Only step-6 fields — ignore any nested prior-step keys from the GET package shape.
      record.stepFinalReview = mergeStepPatch(
        record.stepFinalReview,
        pickStepKeys(patch, FINAL_KEYS as string[]),
      );
      break;
  }
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

const hasText = (value?: string | null): boolean => Boolean((value || '').trim());

/** First incomplete step (1–6) from saved DB step JSON — used for Edit resume. */
export function computeResumeStep(record: {
  stepOverview?: StepOverview | null;
  stepAchievements?: StepAchievements | null;
  stepTeamwork?: StepTeamwork | null;
  stepLearning?: StepLearning | null;
  stepEnvironment?: StepEnvironment | null;
  stepFinalReview?: StepFinalReview | null;
}): number {
  const overview = record.stepOverview;
  const summary = (overview?.overallPerformanceSummary || '').trim();
  if (!summary) return 1;

  const projects = record.stepAchievements?.projects || [];
  if (projects.length === 0) return 2;

  const team = record.stepTeamwork;
  const ratings = team?.teamRatings || {};
  const teamDone =
    (ratings.communication || 0) > 0 &&
    hasText(team?.communicationDescription) &&
    (ratings.ownership || 0) > 0 &&
    hasText(team?.ownershipDescription) &&
    (ratings.collaboration || 0) > 0 &&
    hasText(team?.collaborationDescription) &&
    (ratings.problemSolving || 0) > 0 &&
    hasText(team?.problemSolvingDescription) &&
    (ratings.leadership || 0) > 0 &&
    hasText(team?.leadershipDescription) &&
    (ratings.adaptability || 0) > 0 &&
    hasText(team?.adaptabilityDescription);
  if (!teamDone) return 3;

  const learning = record.stepLearning;
  const learningDone =
    hasText(learning?.skillsAcquired) ||
    hasText(learning?.certificationsOrCourses) ||
    hasText(learning?.skillsToImprove) ||
    hasText(learning?.supportOrTrainingRequired) ||
    hasText(learning?.nextQuarterLearningGoals);
  if (!learningDone) return 4;

  const env = record.stepEnvironment;
  const envDone =
    hasText(env?.feedbackOnWorkCulture) ||
    hasText(env?.workLifeBalance) ||
    hasText(env?.suggestionsForImprovement) ||
    hasText(env?.challengesAffectingProductivity) ||
    (env?.workEnvironmentRating || 0) > 0 ||
    (env?.toolsResourcesRating || 0) > 0 ||
    (env?.managerSupportRating || 0) > 0;
  if (!envDone) return 5;

  return 6;
}

export function slugForResumeStep(step: number): PerformanceStepSlug {
  const map: Record<number, PerformanceStepSlug> = {
    1: 'overview',
    2: 'achievements',
    3: 'teamwork',
    4: 'learning',
    5: 'environment',
    6: 'final-review',
  };
  return map[step] || 'overview';
}
