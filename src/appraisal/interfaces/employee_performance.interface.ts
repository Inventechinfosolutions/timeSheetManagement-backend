export interface PerformanceAttachment {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  objectKey: string;
}

export interface PerformanceProjectAttachment {
  fileName: string;
  fileUrl?: string;
  fileSize?: number;
  fileType?: string;
  objectKey: string;
}

export interface StepAchievements {
  projects?: PerformanceProject[];
}

export interface StepOverview {
  overallPerformanceSummary?: string;
  keyHighlights?: string;
  majorContributions?: string;
  areasForImprovement?: string;
  reviewPeriodStart?: string;
  reviewPeriodEnd?: string;
}

export interface StepTeamwork {
  teamCollaborationSummary?: string;
  crossTeamContributions?: string;
  knowledgeSharingMentoring?: string;
  teamworkExamples?: string;
  teamRatings?: Record<string, number>;
  communicationDescription?: string;
  ownershipDescription?: string;
  collaborationDescription?: string;
  problemSolvingDescription?: string;
  leadershipDescription?: string;
  adaptabilityDescription?: string;
}

export interface StepLearning {
  skillsAcquired?: string;
  certificationsOrCourses?: string;
  skillsToImprove?: string;
  supportOrTrainingRequired?: string;
  nextQuarterLearningGoals?: string;
}

export interface StepEnvironment {
  workEnvironmentRating?: number | null;
  toolsResourcesRating?: number | null;
  managerSupportRating?: number | null;
  challengesAffectingProductivity?: string;
  feedbackOnWorkCulture?: string;
  workLifeBalance?: string;
  suggestionsForImprovement?: string;
  rateCompanyEnvironment?: string | null;
}

export interface StepFinalReview {
  overallSelfRating?: number | null;
  overallEmployeeComments?: string;
  careerGrowthInterests?: string;
  confirmationAccepted?: boolean;
}

export interface PerformanceProject {
  projectName: string;
  description: string;
  challenge?: string;
  projectRole?: string;
  responsibilityType?: string;
  keyResponsibilities?: string;
  challengesFaced?: string;
  solutionsImplemented?: string;
  keyAchievementsOutcomes?: string;
  technologiesUsed?: string[];
  leadershipQualities?: string;
  clientReviewFeedback?: string;
  isDraft?: boolean;
  attachments?: PerformanceProjectAttachment[];
}
