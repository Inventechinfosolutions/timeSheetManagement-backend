import { baseLayout } from './base.layout';

export interface ColleagueBirthdayData {
  recipientName: string;
  birthdayEmployeeName: string;
  department?: string;
  designation?: string;
}

export const getColleagueBirthdayTemplate = (data: ColleagueBirthdayData) => {
  const rawDept = data.department || 'our';
  const deptText = rawDept.toLowerCase().includes('department') ? rawDept : `${rawDept} department`;

  const content = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #1f2937; line-height: 1.6;">
      <p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Dear <strong>${data.recipientName}</strong>,</p>

      <p style="margin: 0 0 20px 0; font-size: 15px; color: #334155; line-height: 1.6;">
        Today is your colleague <strong>${data.birthdayEmployeeName}'s</strong> birthday from the <strong>${deptText}</strong>! Please take a moment to wish them a very happy birthday and share your warm wishes to make their day special.
      </p>

      <p style="margin: 28px 0 0 0; font-size: 14px; color: #64748b; line-height: 1.5;">
        Warmest Regards,<br>
        <strong style="color: #0f172a;">Worksphere Team</strong><br>
        <span style="font-size: 13px; color: #94a3b8;">InvenTech Info Solutions</span>
      </p>
    </div>
  `;

  const title = `Today is ${data.birthdayEmployeeName}'s Birthday! - Worksphere`;
  const headerCardTitle = `Colleague Birthday Celebration`;

  return baseLayout(content, title, headerCardTitle);
};
