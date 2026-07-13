import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommunicationService } from '../../python-face-communication/communication.service';
import { EmployeeDetails } from '../entities/employeeDetails.entity';
import { EmployeeAttendanceService } from './employeeAttendance.service';
import { normalizeCheckInTime } from '../utils/attendance-time.util';

/**
 * =============================================================================
 * DEV TESTING — Face attendance time simulation (.env.local)
 * =============================================================================
 *
 * Use these optional env vars to test check-in/out scenarios without waiting
 * for real clock time. When all are empty/unset, behavior is unchanged.
 *
 * | Variable                  | Example   | Purpose                                      |
 * |---------------------------|-----------|----------------------------------------------|
 * | FACE_TEST_CHECKIN_TIME    | 09:30     | Override check-in clock (24h HH:mm)          |
 * | FACE_TEST_CHECKOUT_TIME   | 13:00     | Override check-out clock (24h HH:mm)         |
 * | FACE_TEST_SKIP_VERIFY     | true      | Skip Python face verify (local testing only) |
 *
 * Typical flow
 * ------------
 * 1. Leave all FACE_TEST_* vars empty → normal production behavior.
 * 2. Check in once (real face or FACE_TEST_SKIP_VERIFY=true).
 * 3. Set FACE_TEST_CHECKOUT_TIME=13:00 → restart backend → Re check-out.
 *    - Check-in 9:30 + checkout 13:00 ≈ 3.5h → Half Day (Office + Absent).
 * 4. Set FACE_TEST_CHECKOUT_TIME=18:30 → restart → Re check-out again.
 *    - ≈ 9h → Full Day.
 *
 * Quick reference (check-in normalized to 9:30 AM)
 * ------------------------------------------------
 *   13:00 checkout → Half Day (~3.5h)
 *   16:30 checkout → Full Day (7h)
 *   18:30 checkout → Full Day (9h)
 *
 * How to revert (before production / commit)
 * ------------------------------------------
 * 1. In .env.local: remove or comment out all FACE_TEST_* lines.
 * 2. Restart the backend.
 * 3. Confirm check-out uses the client timestamp and face verify is required.
 * 4. Optional hard revert: delete the "DEV TESTING" section in this file
 *    (resolveTestTime, isTestVerifySkipped, ConfigService injection).
 *
 * =============================================================================
 */

@Injectable()
export class EmployeeFaceService {
  private readonly logger = new Logger(EmployeeFaceService.name);

  constructor(
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    private readonly communicationService: CommunicationService,
    private readonly employeeAttendanceService: EmployeeAttendanceService,
    private readonly configService: ConfigService,
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
    const today = new Date();

    // DEV: FACE_TEST_CHECKIN_TIME=09:30 (see file header for full guide)
    const effectiveCheckIn = this.resolveTestTime(
      'FACE_TEST_CHECKIN_TIME',
      checkingInTime,
      today,
    );

    const verifyResult = await this.verifyFace(
      employeeId,
      effectiveCheckIn,
      images,
      'Check-in successful',
    );

    const normalizedCheckIn = normalizeCheckInTime(effectiveCheckIn, today);
    const attendance = await this.employeeAttendanceService.upsertFaceAttendance(
      employeeId,
      today,
      { checkingInTime: normalizedCheckIn },
    );

    return {
      ...verifyResult,
      attendance: {
        checkingInTime: attendance.checkingInTime,
        checkingOutTime: attendance.checkingOutTime,
        totalHours: attendance.totalHours,
        status: attendance.status,
      },
    };
  }

  async checkout(checkingOutTime: Date, employeeId: string, images: string[]) {
    const today = new Date();

    // DEV: FACE_TEST_CHECKOUT_TIME=13:00 | 16:30 | 18:30 (see file header)
    const effectiveCheckout = this.resolveTestTime(
      'FACE_TEST_CHECKOUT_TIME',
      checkingOutTime,
      today,
    );

    const verifyResult = await this.verifyFace(
      employeeId,
      effectiveCheckout,
      images,
      'Check-out successful',
    );

    const attendance = await this.employeeAttendanceService.upsertFaceAttendance(
      employeeId,
      today,
      { checkingOutTime: effectiveCheckout },
    );

    return {
      ...verifyResult,
      attendance: {
        checkingInTime: attendance.checkingInTime,
        checkingOutTime: attendance.checkingOutTime,
        totalHours: attendance.totalHours,
        status: attendance.status,
      },
    };
  }

  async getFaceAttendanceStatus(employeeId: string) {
    const employeeDetails = await this.getEmployeeOrThrow(employeeId);
    const isFaceEnrolled = !!employeeDetails.embedings?.length;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const records = await this.employeeAttendanceService.findByDate(
      todayStr,
      employeeId,
    );
    const record = records[0] ?? null;

    const hasCheckedIn = !!record?.checkingInTime;
    const hasCheckedOut = !!record?.checkingOutTime;

    return {
      isFaceEnrolled,
      hasCheckedIn,
      hasCheckedOut,
      checkingInTime: record?.checkingInTime ?? null,
      checkingOutTime: record?.checkingOutTime ?? null,
      canCheckin: isFaceEnrolled && !hasCheckedIn,
      canCheckout: isFaceEnrolled && hasCheckedIn,
      checkoutLocked: false,
    };
  }

  // ---------------------------------------------------------------------------
  // DEV TESTING helpers — safe no-ops when env vars are unset
  // ---------------------------------------------------------------------------

  /**
   * Reads FACE_TEST_CHECKIN_TIME or FACE_TEST_CHECKOUT_TIME (format "HH:mm").
   * Returns `fallback` when the env var is missing or invalid.
   */
  private resolveTestTime(
    envKey: 'FACE_TEST_CHECKIN_TIME' | 'FACE_TEST_CHECKOUT_TIME',
    fallback: Date,
    workingDate: Date,
  ): Date {
    const raw = this.configService.get<string>(envKey)?.trim();
    if (!raw) {
      return fallback;
    }

    const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
    if (!match) {
      this.logger.warn(
        `[DEV] Ignoring invalid ${envKey}="${raw}" — expected HH:mm (e.g. 13:00)`,
      );
      return fallback;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      this.logger.warn(`[DEV] Ignoring out-of-range ${envKey}="${raw}"`);
      return fallback;
    }

    const simulated = new Date(workingDate);
    simulated.setHours(hours, minutes, 0, 0);
    this.logger.warn(`[DEV] ${envKey} active → using ${raw} instead of client time`);
    return simulated;
  }

  /** True when FACE_TEST_SKIP_VERIFY=true in .env.local */
  private isTestVerifySkipped(): boolean {
    return this.configService.get<string>('FACE_TEST_SKIP_VERIFY')?.trim() === 'true';
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

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

    // DEV: FACE_TEST_SKIP_VERIFY=true — remove env var to require real face match
    if (this.isTestVerifySkipped()) {
      this.logger.warn('[DEV] FACE_TEST_SKIP_VERIFY=true — face verification skipped');
      return {
        success: true,
        employeeId,
        verified: true,
        message: `${successMessage} (verify skipped — DEV)`,
      };
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
