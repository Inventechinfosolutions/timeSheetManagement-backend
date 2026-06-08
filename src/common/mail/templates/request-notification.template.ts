import { WorkLocation } from '../../../employeeTimeSheet/enums/work-location.enum';
import { LeaveRequestType } from '../../../employeeTimeSheet/enums/leave-request-type.enum';
import { AttendanceStatus } from '../../../employeeTimeSheet/enums/attendance-status.enum';
import { getSimpleEmailTemplate } from './simple-email.template';

export interface RequestNotificationData {
  employeeName: string;
  employeeId: string;
  requestType: string;
  title: string;
  fromDate: string;
  toDate: string;
  duration: string | number;
  status: string;
  description?: string;
  recipientName?: string;
  firstHalf?: string | null;
  secondHalf?: string | null;
}

const getRequestDisplayName = (data: RequestNotificationData): string => {
  let requestDisplayName = data.requestType;
  const fHalf = data.firstHalf || WorkLocation.OFFICE;
  const sHalf = data.secondHalf || WorkLocation.OFFICE;

  if (fHalf !== WorkLocation.OFFICE || sHalf !== WorkLocation.OFFICE) {
    if (fHalf === sHalf) {
      requestDisplayName =
        fHalf === LeaveRequestType.APPLY_LEAVE ||
        fHalf === AttendanceStatus.LEAVE
          ? 'Leave'
          : fHalf;
    } else if (
      (fHalf === AttendanceStatus.LEAVE ||
        fHalf === LeaveRequestType.APPLY_LEAVE) &&
      sHalf === WorkLocation.OFFICE
    ) {
      requestDisplayName = 'Half Day Leave';
    } else if (
      fHalf === WorkLocation.OFFICE &&
      (sHalf === AttendanceStatus.LEAVE ||
        sHalf === LeaveRequestType.APPLY_LEAVE)
    ) {
      requestDisplayName = 'Half Day Leave';
    } else {
      const parts = [fHalf, sHalf]
        .map((h) =>
          h === LeaveRequestType.APPLY_LEAVE || h === AttendanceStatus.LEAVE
            ? 'Leave'
            : h,
        )
        .filter((h) => h && h !== WorkLocation.OFFICE);
      requestDisplayName = parts.join(' + ');
    }
  }

  return requestDisplayName;
};

export const getRequestNotificationTemplate = (
  data: RequestNotificationData,
) => {
  const statusLower = data.status.toLowerCase();
  const requestDisplayName = getRequestDisplayName(data);

  const dateText =
    data.fromDate === data.toDate
      ? `on ${data.fromDate}`
      : `from ${data.fromDate} to ${data.toDate}`;

  let mailSubject = `New ${requestDisplayName} Request`;
  if (statusLower === 'cancelled' || statusLower === 'reverted') {
    mailSubject = `${requestDisplayName} Reverted`;
  } else if (statusLower.includes('cancellation')) {
    mailSubject = `${requestDisplayName} Cancellation Request`;
  } else if (statusLower.includes('modification')) {
    mailSubject = `${requestDisplayName} Modification Request`;
  }

  const greeting = data.recipientName
    ? `Hello ${data.recipientName},`
    : 'Dear Sir,';

  const bodyLines: string[] = [`<strong>Subject:</strong> ${data.title}`];

  if (data.description?.trim()) {
    bodyLines.push(data.description.trim());
  } else {
    bodyLines.push(
      `I am writing to submit a ${requestDisplayName} request ${dateText}.`,
    );
  }

  bodyLines.push(
    `Request period: ${dateText} (${data.duration} day(s)).`,
    'Thank you for your understanding.',
  );

  return getSimpleEmailTemplate({
    recipientName: data.recipientName || 'Sir',
    subject: mailSubject,
    greeting,
    bodyLines,
    signOffPrefix: 'Yours sincerely,',
    signOff: data.employeeName,
  });
};
