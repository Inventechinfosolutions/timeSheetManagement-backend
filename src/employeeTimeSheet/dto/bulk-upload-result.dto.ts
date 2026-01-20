import { ApiProperty } from '@nestjs/swagger';

export class BulkUploadErrorDto {
  @ApiProperty({ description: 'Row number in Excel file where error occurred' })
  row: number;

  @ApiProperty({ description: 'Field name that caused the error' })
  field?: string;

  @ApiProperty({ description: 'Error message' })
  message: string;
}

export class BulkUploadResultDto {
  @ApiProperty({ description: 'Number of employees successfully created' })
  successCount: number;

  @ApiProperty({ description: 'Number of employees that failed validation or creation' })
  failureCount: number;

  @ApiProperty({ 
    description: 'Array of successfully created employee IDs',
    type: [String]
  })
  createdEmployees: string[];

  @ApiProperty({ 
    description: 'Array of errors with row numbers and messages',
    type: [BulkUploadErrorDto]
  })
  errors: BulkUploadErrorDto[];

  @ApiProperty({ description: 'Overall status message' })
  message: string;
}
