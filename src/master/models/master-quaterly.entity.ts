import { ApiProperty } from '@nestjs/swagger';

export class MasterQuaterly {
  @ApiProperty({ example: 1, description: 'Quarter index ID' })
  id: number;

  @ApiProperty({ example: 'Q1', description: 'Quarter label (Q1, Q2, Q3, Q4)' })
  quaterLabel: string; // 'Q1', 'Q2', 'Q3', 'Q4'

  @ApiProperty({ example: 'April', description: 'Quarter starting month' })
  fromMonth: string; // 'April', 'July', 'October', 'January'

  @ApiProperty({ example: 'June', description: 'Quarter ending month' })
  toMonth: string; // 'June', 'September', 'December', 'March'

  @ApiProperty({ example: 'April to June', description: 'Description of quarter', required: false })
  description?: string; // 'April to June'
}
