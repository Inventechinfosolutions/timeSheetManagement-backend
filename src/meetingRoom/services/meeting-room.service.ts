import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import dayjs from 'dayjs';
import { MeetingRoom } from '../entities/meeting-room.entity';
import { MeetingRoomBooking } from '../entities/meeting-room-booking.entity';
import { MeetingRoomBookingMember } from '../entities/meeting-room-booking-member.entity';
import { BookingComputedStatus, BookingState } from '../enums/booking-state.enum';
import { CreateMeetingRoomDto } from '../dto/create-meeting-room.dto';
import { CheckAvailabilityQueryDto } from '../dto/check-availability.dto';
import { CreateBookingDto } from '../dto/create-booking.dto';
import { QueryBookingsDto } from '../dto/query-bookings.dto';
import { EmployeeDetails } from '../../employeeTimeSheet/entities/employeeDetails.entity';
import { UserType } from '../../users/enums/user-type.enum';
import { MailService } from '../../common/mail/mail.service';
import {
  getMeetingBookingCancelledEmailTemplate,
  getMeetingBookingInviteEmailTemplate,
  getMeetingBookingReminderEmailTemplate,
  MeetingEmailPayload,
} from '../../common/mail/email-templates';

const ORG_BOOKING_VIEW_ROLES: UserType[] = [
  UserType.ADMIN,
  UserType.CEO,
  UserType.GENERAL_MANAGER,
  UserType.RECEPTIONIST,
];

@Injectable()
export class MeetingRoomService {
  private readonly logger = new Logger(MeetingRoomService.name);

  constructor(
    @InjectRepository(MeetingRoom)
    private readonly roomRepository: Repository<MeetingRoom>,
    @InjectRepository(MeetingRoomBooking)
    private readonly bookingRepository: Repository<MeetingRoomBooking>,
    @InjectRepository(MeetingRoomBookingMember)
    private readonly memberRepository: Repository<MeetingRoomBookingMember>,
    @InjectRepository(EmployeeDetails)
    private readonly employeeDetailsRepository: Repository<EmployeeDetails>,
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {}

  private normalizeDateStr(val: string | Date): string {
    if (!val) return '';
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
      return val.trim();
    }
    return dayjs(val).format('YYYY-MM-DD');
  }

  private normalizeTimeStr(val: string): string {
    const trimmed = String(val || '').trim();
    const parts = trimmed.split(':');
    if (parts.length === 2) {
      return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
    }
    if (parts.length >= 3) {
      return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
    }
    return trimmed;
  }

  private toDisplayTime12h(timeStr: string): string {
    const norm = this.normalizeTimeStr(timeStr);
    const [hStr, mStr] = norm.split(':');
    const h = Number(hStr);
    const m = Number(mStr);
    if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  private formatTimeRange12h(startTime: string, endTime: string): string {
    return `${this.toDisplayTime12h(startTime)} - ${this.toDisplayTime12h(endTime)}`;
  }

  private formatDisplayDate(dateStr: string): string {
    const parsed = dayjs(dateStr);
    return parsed.isValid() ? parsed.format('dddd, MMM D, YYYY') : dateStr;
  }

  private validateSlotWindow(date: string, startTime: string, endTime: string): {
    normDate: string;
    normStart: string;
    normEnd: string;
  } {
    const normDate = this.normalizeDateStr(date);
    const normStart = this.normalizeTimeStr(startTime);
    const normEnd = this.normalizeTimeStr(endTime);

    const parsedDate = dayjs(normDate, 'YYYY-MM-DD');
    if (!parsedDate.isValid()) {
      throw new BadRequestException('Invalid booking date');
    }

    if (normEnd <= normStart) {
      throw new BadRequestException('End time must be after start time');
    }

    const now = dayjs();
    const todayStr = now.format('YYYY-MM-DD');
    if (normDate < todayStr) {
      throw new BadRequestException('Booking date must be today or a future date');
    }

    if (normDate === todayStr) {
      const startMoment = dayjs(`${normDate}T${normStart}`);
      // Allow 2-minute tolerance when selecting the current minute
      if (startMoment.isBefore(now.subtract(2, 'minute'))) {
        throw new BadRequestException('Start time cannot be in the past for today');
      }
    }

    return { normDate, normStart, normEnd };
  }

  computeStatus(booking: MeetingRoomBooking): BookingComputedStatus {
    if (booking.bookingState === BookingState.CANCELLED) {
      return BookingComputedStatus.CANCELLED;
    }
    const dateStr = this.normalizeDateStr(booking.bookingDate);
    const endStr = this.normalizeTimeStr(booking.endTime);
    const endDateTime = dayjs(`${dateStr}T${endStr}`);
    if (endDateTime.isValid() && !endDateTime.isAfter(dayjs())) {
      return BookingComputedStatus.CLOSED;
    }
    return BookingComputedStatus.OPEN;
  }

  private serializeBooking(booking: MeetingRoomBooking) {
    const status = this.computeStatus(booking);
    const dateStr = this.normalizeDateStr(booking.bookingDate);
    const startStr = this.normalizeTimeStr(booking.startTime).slice(0, 5);
    const endStr = this.normalizeTimeStr(booking.endTime).slice(0, 5);

    return {
      id: booking.id,
      roomId: booking.roomId,
      room: booking.room
        ? {
            id: booking.room.id,
            floorNumber: booking.room.floorNumber,
            roomNumber: booking.room.roomNumber,
            dimensionSqFt: Number(booking.room.dimensionSqFt),
            isActive: booking.room.isActive,
          }
        : null,
      bookedByUserId: booking.bookedByUserId,
      bookedByLoginId: booking.bookedByLoginId,
      bookedByName: booking.bookedByName,
      bookedByEmail: booking.bookedByEmail,
      department: booking.department,
      bookingDate: dateStr,
      startTime: startStr,
      endTime: endStr,
      timeRangeLabel: this.formatTimeRange12h(booking.startTime, booking.endTime),
      title: booking.title,
      bookingState: booking.bookingState,
      status,
      cancelledBy: booking.cancelledBy,
      cancelledAt: booking.cancelledAt,
      lastReminderSentAt: booking.lastReminderSentAt,
      createdAt: booking.createdAt,
      members: (booking.members || []).map((m) => ({
        id: m.id,
        employeeId: m.employeeId,
        fullName: m.fullName,
        email: m.email,
        department: m.department,
        designation: m.designation,
      })),
    };
  }

  private assertAdmin(user: any) {
    const type = user?.userType || user?.role;
    if (type !== UserType.ADMIN) {
      throw new ForbiddenException('Only Admin can perform this action');
    }
  }

  async createRoom(dto: CreateMeetingRoomDto, currentUser: any) {
    this.assertAdmin(currentUser);

    const floorNumber = dto.floorNumber.trim();
    const roomNumber = dto.roomNumber.trim();
    const dimensionSqFt = Number(dto.dimensionSqFt);

    const existing = await this.roomRepository
      .createQueryBuilder('r')
      .where('LOWER(r.floorNumber) = LOWER(:floorNumber)', { floorNumber })
      .andWhere('LOWER(r.roomNumber) = LOWER(:roomNumber)', { roomNumber })
      .getOne();

    if (existing) {
      throw new ConflictException(
        `Meeting Room "${roomNumber}" on Floor "${floorNumber}" already exists`,
      );
    }

    const actor = currentUser?.loginId || 'Admin';
    const room = this.roomRepository.create({
      floorNumber,
      roomNumber,
      dimensionSqFt,
      isActive: true,
      createdBy: actor,
      updatedBy: actor,
    });

    const saved = await this.roomRepository.save(room);
    return {
      id: saved.id,
      floorNumber: saved.floorNumber,
      roomNumber: saved.roomNumber,
      dimensionSqFt: Number(saved.dimensionSqFt),
      isActive: saved.isActive,
      totalBookings: 0,
      openBookings: 0,
      createdAt: saved.createdAt,
    };
  }

  async getAllRooms() {
    const rooms = await this.roomRepository.find({
      where: { isActive: true },
      order: { floorNumber: 'ASC', roomNumber: 'ASC' },
    });

    if (rooms.length === 0) return [];

    const roomIds = rooms.map((r) => r.id);
    const bookings = await this.bookingRepository.find({
      where: {
        roomId: In(roomIds),
        bookingState: BookingState.BOOKED,
      },
    });

    const statsByRoom = new Map<number, { total: number; open: number }>();
    for (const b of bookings) {
      const entry = statsByRoom.get(b.roomId) || { total: 0, open: 0 };
      entry.total += 1;
      if (this.computeStatus(b) === BookingComputedStatus.OPEN) {
        entry.open += 1;
      }
      statsByRoom.set(b.roomId, entry);
    }

    return rooms.map((r) => {
      const stats = statsByRoom.get(r.id) || { total: 0, open: 0 };
      return {
        id: r.id,
        floorNumber: r.floorNumber,
        roomNumber: r.roomNumber,
        dimensionSqFt: Number(r.dimensionSqFt),
        isActive: r.isActive,
        totalBookings: stats.total,
        openBookings: stats.open,
        createdAt: r.createdAt,
      };
    });
  }

  async checkAvailability(dto: CheckAvailabilityQueryDto) {
    const { normDate, normStart, normEnd } = this.validateSlotWindow(
      dto.date,
      dto.startTime,
      dto.endTime,
    );

    const rooms = await this.roomRepository.find({
      where: { isActive: true },
      order: { floorNumber: 'ASC', roomNumber: 'ASC' },
    });

    if (rooms.length === 0) {
      return {
        date: normDate,
        startTime: normStart.slice(0, 5),
        endTime: normEnd.slice(0, 5),
        totalRooms: 0,
        bookedRooms: 0,
        availableRooms: 0,
        rooms: [],
      };
    }

    const overlapping = await this.bookingRepository
      .createQueryBuilder('b')
      .where('b.bookingDate = :date', { date: normDate })
      .andWhere('b.bookingState = :state', { state: BookingState.BOOKED })
      .andWhere('b.startTime < :endTime', { endTime: normEnd })
      .andWhere('b.endTime > :startTime', { startTime: normStart })
      .orderBy('b.startTime', 'ASC')
      .getMany();

    const overlapsByRoom = new Map<number, MeetingRoomBooking[]>();
    for (const b of overlapping) {
      const arr = overlapsByRoom.get(b.roomId) || [];
      arr.push(b);
      overlapsByRoom.set(b.roomId, arr);
    }

    const roomResults = rooms.map((r) => {
      const conflicts = overlapsByRoom.get(r.id) || [];
      const isAvailable = conflicts.length === 0;
      return {
        id: r.id,
        floorNumber: r.floorNumber,
        roomNumber: r.roomNumber,
        dimensionSqFt: Number(r.dimensionSqFt),
        isAvailable,
        conflicts: conflicts.map((c) => ({
          id: c.id,
          bookedByName: c.bookedByName,
          department: c.department,
          startTime: this.normalizeTimeStr(c.startTime).slice(0, 5),
          endTime: this.normalizeTimeStr(c.endTime).slice(0, 5),
          timeRangeLabel: this.formatTimeRange12h(c.startTime, c.endTime),
          title: c.title,
        })),
      };
    });

    const bookedRooms = roomResults.filter((r) => !r.isAvailable).length;
    const availableRooms = roomResults.length - bookedRooms;

    return {
      date: normDate,
      startTime: normStart.slice(0, 5),
      endTime: normEnd.slice(0, 5),
      timeRangeLabel: this.formatTimeRange12h(normStart, normEnd),
      totalRooms: roomResults.length,
      bookedRooms,
      availableRooms,
      rooms: roomResults,
    };
  }

  async createBooking(dto: CreateBookingDto, currentUser: any) {
    const { normDate, normStart, normEnd } = this.validateSlotWindow(
      dto.bookingDate,
      dto.startTime,
      dto.endTime,
    );

    const loginId = currentUser?.loginId || 'User';
    const organizerEmp = loginId
      ? await this.employeeDetailsRepository.findOne({ where: { employeeId: loginId } })
      : null;

    const bookedByName =
      organizerEmp?.fullName || currentUser?.aliasLoginName || loginId || 'WorkSphere User';
    const bookedByEmail = organizerEmp?.email || null;
    const organizerDept =
      organizerEmp?.department ||
      (currentUser?.userType === UserType.ADMIN
        ? 'Admin'
        : currentUser?.userType === UserType.CEO
          ? 'CEO'
          : currentUser?.userType === UserType.GENERAL_MANAGER
            ? 'General Manager'
            : currentUser?.userType || null);

    // Deduplicate invited members by email/employeeId and enrich from employee_details
    const seenEmails = new Set<string>();
    const uniqueInputs = (dto.members || []).filter((m) => {
      const key = m.email.trim().toLowerCase();
      if (!key || seenEmails.has(key)) return false;
      seenEmails.add(key);
      return true;
    });

    const memberIds = uniqueInputs.map((m) => m.employeeId).filter(Boolean);
    const directoryRows =
      memberIds.length > 0
        ? await this.employeeDetailsRepository.find({
            where: { employeeId: In(memberIds) },
          })
        : [];
    const empMap = new Map(directoryRows.map((e) => [e.employeeId, e]));

    const savedBooking = await this.dataSource.transaction(async (manager) => {
      const room = await manager
        .getRepository(MeetingRoom)
        .createQueryBuilder('r')
        .setLock('pessimistic_write')
        .where('r.id = :id AND r.isActive = :active', { id: dto.roomId, active: true })
        .getOne();

      if (!room) {
        throw new NotFoundException('Selected meeting room was not found or is inactive');
      }

      const conflictCount = await manager
        .getRepository(MeetingRoomBooking)
        .createQueryBuilder('b')
        .where('b.roomId = :roomId', { roomId: room.id })
        .andWhere('b.bookingDate = :date', { date: normDate })
        .andWhere('b.bookingState = :state', { state: BookingState.BOOKED })
        .andWhere('b.startTime < :endTime', { endTime: normEnd })
        .andWhere('b.endTime > :startTime', { startTime: normStart })
        .getCount();

      if (conflictCount > 0) {
        throw new ConflictException(
          `Room ${room.roomNumber} (Floor ${room.floorNumber}) is already booked during ${this.formatTimeRange12h(
            normStart,
            normEnd,
          )}. Please choose another room or time slot.`,
        );
      }

      const bookingEntity = manager.getRepository(MeetingRoomBooking).create({
        roomId: room.id,
        room,
        bookedByUserId: String(currentUser?.id || loginId),
        bookedByLoginId: loginId,
        bookedByName,
        bookedByEmail,
        department: organizerDept,
        bookingDate: normDate,
        startTime: normStart,
        endTime: normEnd,
        title: dto.title?.trim() || null,
        bookingState: BookingState.BOOKED,
        createdBy: loginId,
        updatedBy: loginId,
      });

      const created = await manager.getRepository(MeetingRoomBooking).save(bookingEntity);

      const memberEntities = uniqueInputs.map((m) => {
        const emp = empMap.get(m.employeeId);
        return manager.getRepository(MeetingRoomBookingMember).create({
          bookingId: created.id,
          employeeId: m.employeeId.trim(),
          fullName: (emp?.fullName || m.fullName).trim(),
          email: m.email.trim(),
          department: emp?.department || m.department || null,
          designation: emp?.designation || m.designation || null,
          createdBy: loginId,
          updatedBy: loginId,
        });
      });

      if (memberEntities.length > 0) {
        created.members = await manager
          .getRepository(MeetingRoomBookingMember)
          .save(memberEntities);
      } else {
        created.members = [];
      }

      created.room = room;
      return created;
    });

    // Queue invitation emails asynchronously to all invited members (and organizer if applicable)
    await this.dispatchBookingEmails(savedBooking, 'invite');

    return this.serializeBooking(savedBooking);
  }

  private async dispatchBookingEmails(
    booking: MeetingRoomBooking,
    kind: 'invite' | 'reminder' | 'cancelled',
  ): Promise<number> {
    const recipientsMap = new Map<string, string>();
    for (const m of booking.members || []) {
      if (m.email && m.email.trim()) {
        recipientsMap.set(m.email.trim().toLowerCase(), m.fullName || m.employeeId);
      }
    }
    if ((kind === 'invite' || kind === 'cancelled') && booking.bookedByEmail?.trim()) {
      const orgKey = booking.bookedByEmail.trim().toLowerCase();
      if (!recipientsMap.has(orgKey)) {
        recipientsMap.set(orgKey, booking.bookedByName);
      }
    }

    const attendeeNames = (booking.members || []).map((m) => m.fullName);
    const displayDate = this.formatDisplayDate(this.normalizeDateStr(booking.bookingDate));
    const timeRange = this.formatTimeRange12h(booking.startTime, booking.endTime);

    let sent = 0;
    for (const [email, recipientName] of recipientsMap.entries()) {
      const payload: MeetingEmailPayload = {
        recipientName,
        organizerName: booking.bookedByName,
        organizerDepartment: booking.department,
        roomNumber: booking.room?.roomNumber || String(booking.roomId),
        floorNumber: booking.room?.floorNumber || '-',
        dimensionSqFt: Number(booking.room?.dimensionSqFt || 0),
        bookingDate: displayDate,
        timeRange,
        title: booking.title,
        attendeeNames,
      };

      const tpl =
        kind === 'invite'
          ? getMeetingBookingInviteEmailTemplate(payload)
          : kind === 'reminder'
            ? getMeetingBookingReminderEmailTemplate(payload)
            : getMeetingBookingCancelledEmailTemplate(payload);

      await this.mailService.sendMailAsync(email, tpl.subject, tpl.text, tpl.html);
      sent += 1;
    }

    this.logger.log(
      `Queued ${sent} "${kind}" meeting email(s) for booking #${booking.id} (Room ${booking.room?.roomNumber})`,
    );
    return sent;
  }

  async getMyBookings(currentUser: any, query: QueryBookingsDto) {
    const loginId = currentUser?.loginId;
    if (!loginId) return [];

    const qb = this.bookingRepository
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.room', 'room')
      .leftJoinAndSelect('b.members', 'members')
      .where('b.bookedByLoginId = :loginId', { loginId });

    if (query.startDate) {
      qb.andWhere('b.bookingDate >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('b.bookingDate <= :endDate', { endDate: query.endDate });
    }
    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(room.roomNumber LIKE :term OR room.floorNumber LIKE :term OR b.title LIKE :term)',
        { term },
      );
    }

    qb.orderBy('b.bookingDate', 'DESC').addOrderBy('b.startTime', 'DESC');

    const rows = await qb.getMany();
    return rows.map((b) => this.serializeBooking(b));
  }

  async getScopedBookings(currentUser: any, query: QueryBookingsDto) {
    const userType: UserType = currentUser?.userType || currentUser?.role;
    const isOrgViewer = ORG_BOOKING_VIEW_ROLES.includes(userType);
    const isManager = userType === UserType.MANAGER;

    if (!isOrgViewer && !isManager) {
      throw new ForbiddenException('You do not have permission to view team or organization bookings');
    }

    const qb = this.bookingRepository
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.room', 'room')
      .leftJoinAndSelect('b.members', 'members');

    let scopedDepartment: string | null = null;

    if (isManager && !isOrgViewer) {
      const managerEmp = await this.employeeDetailsRepository.findOne({
        where: { employeeId: currentUser?.loginId },
      });
      scopedDepartment = managerEmp?.department || null;
      if (!scopedDepartment) {
        return {
          scope: 'department',
          department: null,
          bookings: [],
        };
      }
      qb.where('b.department = :managerDept', { managerDept: scopedDepartment });
    } else {
      qb.where('1 = 1');
      if (query.department && query.department !== 'All') {
        qb.andWhere('b.department = :dept', { dept: query.department });
      }
    }

    if (query.startDate) {
      qb.andWhere('b.bookingDate >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('b.bookingDate <= :endDate', { endDate: query.endDate });
    }
    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(b.bookedByName LIKE :term OR b.bookedByLoginId LIKE :term OR room.roomNumber LIKE :term OR b.title LIKE :term)',
        { term },
      );
    }

    qb.orderBy('b.bookingDate', 'DESC').addOrderBy('b.startTime', 'DESC');

    const rows = await qb.getMany();
    return {
      scope: isManager && !isOrgViewer ? 'department' : 'all',
      department: scopedDepartment,
      bookings: rows.map((b) => this.serializeBooking(b)),
    };
  }

  async sendReminder(bookingId: number, currentUser: any) {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: ['room', 'members'],
    });
    if (!booking) {
      throw new NotFoundException(`Booking #${bookingId} not found`);
    }

    const status = this.computeStatus(booking);
    if (status !== BookingComputedStatus.OPEN) {
      throw new BadRequestException('Reminders can only be sent for OPEN meeting slots');
    }

    const userType: UserType = currentUser?.userType || currentUser?.role;
    const isOwner = booking.bookedByLoginId === currentUser?.loginId;
    const isOrgViewer = ORG_BOOKING_VIEW_ROLES.includes(userType);

    let isDeptManager = false;
    if (userType === UserType.MANAGER && currentUser?.loginId) {
      const managerEmp = await this.employeeDetailsRepository.findOne({
        where: { employeeId: currentUser.loginId },
      });
      if (managerEmp?.department && managerEmp.department === booking.department) {
        isDeptManager = true;
      }
    }

    if (!isOwner && !isOrgViewer && !isDeptManager) {
      throw new ForbiddenException('You are not authorized to send a reminder for this booking');
    }

    if (!booking.members || booking.members.length === 0) {
      throw new BadRequestException('No invited members are attached to this booking');
    }

    const sentCount = await this.dispatchBookingEmails(booking, 'reminder');
    booking.lastReminderSentAt = new Date();
    booking.updatedBy = currentUser?.loginId || booking.updatedBy;
    await this.bookingRepository.save(booking);

    return {
      message: `Reminder email sent to ${sentCount} member${sentCount === 1 ? '' : 's'}`,
      sentCount,
      booking: this.serializeBooking(booking),
    };
  }

  async cancelBooking(bookingId: number, currentUser: any) {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: ['room', 'members'],
    });
    if (!booking) {
      throw new NotFoundException(`Booking #${bookingId} not found`);
    }

    const status = this.computeStatus(booking);
    if (status !== BookingComputedStatus.OPEN) {
      throw new BadRequestException('Only OPEN meeting slots can be cancelled');
    }

    const userType = currentUser?.userType || currentUser?.role;
    const isAdmin = userType === UserType.ADMIN;
    const actorLoginId = String(currentUser?.loginId || '').trim();
    const isOwner =
      actorLoginId.length > 0 &&
      actorLoginId.toLowerCase() === String(booking.bookedByLoginId || '').trim().toLowerCase();

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Only the person who booked this slot can cancel it');
    }

    if (!isAdmin) {
      const dateStr = this.normalizeDateStr(booking.bookingDate);
      const startStr = this.normalizeTimeStr(booking.startTime);
      const startDateTime = dayjs(`${dateStr}T${startStr}`);
      if (!startDateTime.isValid() || !startDateTime.isAfter(dayjs())) {
        throw new BadRequestException(
          'You can delete this booking only before the slot starts',
        );
      }
    }

    const actor = currentUser?.loginId || 'Admin';
    booking.bookingState = BookingState.CANCELLED;
    booking.cancelledBy = actor;
    booking.cancelledAt = new Date();
    booking.updatedBy = actor;

    const updated = await this.bookingRepository.save(booking);
    const sentCount = await this.dispatchBookingEmails(updated, 'cancelled');

    return {
      message: 'Meeting slot cancelled and notification sent to members',
      sentCount,
      booking: this.serializeBooking(updated),
    };
  }
}
