import { Injectable } from '@nestjs/common';
import { CommunicationService } from './communication.service';

@Injectable()
export class DemoServiceCallerService {
  constructor(private readonly communicationService: CommunicationService) {}

  async enrollFace(employeeId: string, images: string[]) {
    return this.communicationService.enrollFace(employeeId, images);
  }

  async verifyFace(employeeId: string, embedding: number[], images: string[]) {
    return this.communicationService.verifyFace(employeeId, embedding, images);
  }
}
