import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommunicationService } from '../../python-face-communication/communication.service';
import { EmployeeDetails } from '../entities/employeeDetails.entity';

@Injectable()
export class EmployeeFaceService {
  constructor(
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    private readonly communicationService: CommunicationService,
  ) {}

  async enrollFace(employeeId: string, images: string[]) {
    const employeeDetails = await this.getEmployeeOrThrow(employeeId);

    try {
      const result = await this.communicationService.enrollFace(employeeId, images);
      employeeDetails.embedings = result.embedding;
      await this.employeeDetailsRepository.save(employeeDetails);
      return {
        success: true,
        employeeId,
        message: result.message ?? 'Face enrolled successfully',
      };
    } catch (error) {
      throw new BadRequestException(this.extractErrorMessage(error, 'Face enrollment failed'));
    }
  }

  async checkin(checkingInTime: Date, employeeId: string, images: string[]) {
    return this.verifyFace(employeeId, checkingInTime, images, 'Check-in successful');
  }

  async checkout(checkingOutTime: Date, employeeId: string, images: string[]) {
    return this.verifyFace(employeeId, checkingOutTime, images, 'Check-out successful');
  }

  async isFaceEnrolled(employeeId: string) {
    const employeeDetails = await this.getEmployeeOrThrow(employeeId);
    return !!employeeDetails.embedings;
  }

  private async getEmployeeOrThrow(employeeId: string): Promise<EmployeeDetails> {
    const employeeDetails = await this.employeeDetailsRepository.findOne({ where: { employeeId } });
    if (!employeeDetails) {
      throw new NotFoundException('Employee not found');
    }
    return employeeDetails;
  }

  private isToday(date: Date): boolean {
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const err = error as {
      message?: string;
      response?: { data?: { detail?: { message?: string }; message?: string } };
    };
    return (
      err?.response?.data?.detail?.message ??
      err?.response?.data?.message ??
      err?.message ??
      fallback
    );
  }

  private async verifyFace(
    employeeId: string,
    timestamp: Date,
    images: string[],
    successMessage: string,
  ) {
    if (!this.isToday(timestamp)) {
      throw new BadRequestException('Submitted time is not current date');
    }

    const employeeDetails = await this.getEmployeeOrThrow(employeeId);
    if (!employeeDetails.embedings?.length) {
      throw new BadRequestException('Face not enrolled');
    }

    try {
      const result = await this.communicationService.verifyFace(
        employeeId,
        employeeDetails.embedings,
        images,
      );
      if (!result.match) {
        throw new BadRequestException('Face not recognized');
      }
      return {
        success: true,
        employeeId,
        verified: true,
        message: successMessage,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(this.extractErrorMessage(error, 'Face verification failed'));
    }
  }
}
