import { ApiProperty } from '@nestjs/swagger';

export class RevealedEvaluationDto {
  @ApiProperty()
  quarter: string;

  @ApiProperty()
  financialYear: string;

  @ApiProperty()
  finalRating: number;

  @ApiProperty()
  ratingDescription: string;

  @ApiProperty()
  productivity: number;

  @ApiProperty()
  qualityOfWork: number;

  @ApiProperty()
  ownershipResponsibility: number;

  @ApiProperty()
  communication: number;

  @ApiProperty()
  teamCollaboration: number;

  @ApiProperty()
  innovationProblemSolving: number;

  @ApiProperty({ required: false })
  technicalJobSkills?: number;

  @ApiProperty({ required: false })
  overallPerformanceRating?: number;

  @ApiProperty()
  performanceStrengths: string;

  @ApiProperty()
  areasOfImprovement: string;

  @ApiProperty()
  managerComment: string;

  @ApiProperty({ required: false })
  goalsForNextReviewPeriod?: string;

  @ApiProperty({ required: false })
  trainingDevelopmentRecommendations?: string;

  @ApiProperty({ required: false })
  careerGrowthRecommendation?: string;

  @ApiProperty({ required: false })
  reviewOutcome?: string;

  @ApiProperty({ required: false })
  performanceAction?: string;

  @ApiProperty({ required: false })
  managerConfirmation?: boolean;

  @ApiProperty()
  passwordVerified: boolean;
}

