import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DemoServiceCallerService } from './demo-service-caller.service';
import { EnrollFaceDemoDto, VerifyFaceDemoDto } from './dto/face-demo.dto';

@ApiTags('Face Demo')
@Controller('demo/face')
@UseGuards(JwtAuthGuard)
export class DemoController {
  constructor(private readonly demoServiceCaller: DemoServiceCallerService) {}

  @Post('enroll')
  async enroll(@Body() body: EnrollFaceDemoDto) {
    try {
      return await this.demoServiceCaller.enrollFace(body.employeeId, body.images);
    } catch (error: any) {
      throw this.toHttpException(error);
    }
  }

  @Post('verify')
  async verify(@Body() body: VerifyFaceDemoDto) {
    try {
      return await this.demoServiceCaller.verifyFace(
        body.employeeId,
        body.embedding,
        body.images,
      );
    } catch (error: any) {
      throw this.toHttpException(error);
    }
  }

  private toHttpException(error: any): HttpException {
    const detail = error?.response?.data?.detail;
    const message =
      detail?.message ||
      detail?.error ||
      error?.response?.data?.message ||
      error?.message ||
      'Face service request failed';

    return new HttpException(
      { message, detail },
      error?.response?.status || HttpStatus.BAD_GATEWAY,
    );
  }
}
