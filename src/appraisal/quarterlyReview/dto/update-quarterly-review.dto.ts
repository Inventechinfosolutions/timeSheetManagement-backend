import { PartialType } from '@nestjs/swagger';
import { CreateQuarterlyReviewDto } from './create-quarterly-review.dto';

export class UpdateQuarterlyReviewDto extends PartialType(CreateQuarterlyReviewDto) {}
