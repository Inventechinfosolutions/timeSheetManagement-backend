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
