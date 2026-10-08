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

  @ApiProperty()
  performanceStrengths: string;

  @ApiProperty()
  areasOfImprovement: string;

  @ApiProperty()
  additionalRemarks: string;

  @ApiProperty()
  passwordVerified: boolean;
}
