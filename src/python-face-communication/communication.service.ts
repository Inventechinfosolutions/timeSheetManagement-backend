import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class CommunicationService {
  private readonly logger = new Logger(CommunicationService.name);

  constructor(private readonly configService: ConfigService) {}

  private get pythonFaceUrl(): string {
    return this.configService.get<string>('PYTHON_FACE_URL') || 'http://localhost:8001';
  }

  async enrollFace(employeeId: string, images: string[]) {
    const response = await axios.post(`${this.pythonFaceUrl}/api/v1/face/enroll-demo`, {
      employee_id: employeeId,
      images,
    });
    return response.data;
  }

  async verifyFace(employeeId: string, embedding: number[], images: string[]) {
    const response = await axios.post(`${this.pythonFaceUrl}/api/v1/face/verify-demo`, {
      employee_id: employeeId,
      embedding,
      images,
    });
    return response.data;
  }
}
