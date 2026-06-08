import {
  getPortalUrl,
  getSimpleEmailTemplate,
} from './simple-email.template';

export interface EmployeeReceiptData {
  employeeName: string;
  requestType: string;
  title: string;
  fromDate: string;
  toDate: string;
  duration: string | number;
  status: string;
  description?: string;
  firstHalf?: string | null;
  secondHalf?: string | null;
}

export const getEmployeeReceiptTemplate = (data: EmployeeReceiptData) => {
  const isModification = data.status.toLowerCase().includes('modification');
  const dateRange =
    data.fromDate === data.toDate
      ? data.fromDate
      : `${data.fromDate} to ${data.toDate}`;

  const bodyLines: string[] = [
    `<strong>Subject:</strong> ${data.title}`,
  ];

  if (data.description?.trim()) {
    bodyLines.push(data.description.trim());
  }

  bodyLines.push(
    isModification
      ? `Your modification request for <strong>${data.requestType}</strong> (${dateRange}) has been submitted and is pending review.`
      : `Your <strong>${data.requestType}</strong> request for ${dateRange} has been submitted and is pending review.`,
  );

  return getSimpleEmailTemplate({
    recipientName: data.employeeName,
    subject: isModification
      ? `Modification Request Submitted: ${data.requestType}`
      : `${data.requestType} Submitted`,
    bodyLines,
    actionLabel: 'Login to portal',
    actionUrl: getPortalUrl(),
  });
};
