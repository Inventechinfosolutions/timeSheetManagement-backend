export enum QuaterlyEnum {
  Q1 = 'Q1',
  Q2 = 'Q2',
  Q3 = 'Q3',
  Q4 = 'Q4',
}

// Backward compatibility and alternate spelling alias
export const QuarterlyEnum = QuaterlyEnum;
export type QuarterlyEnum = QuaterlyEnum;

export enum ProjectRoleEnum {
  FRONTEND_DEVELOPER = 'Frontend Developer',
  BACKEND_DEVELOPER = 'Backend Developer',
  FULL_STACK_DEVELOPER = 'Full Stack Developer',
  QA_ENGINEER = 'QA Engineer',
  UI_UX_DESIGNER = 'UI/UX Designer',
  DEVOPS_ENGINEER = 'DevOps Engineer',
  BUSINESS_ANALYST = 'Business Analyst',
  PROJECT_MANAGER = 'Project Manager',
  OTHER = 'Other',
}

export enum ResponsibilityTypeEnum {
  PROJECT_LEADER = 'Project Leader',
  TEAM_LEAD = 'Team Lead',
  PROJECT_MANAGER = 'Project Manager',
  MODULE_OWNER = 'Module Owner',
  INDIVIDUAL_CONTRIBUTOR = 'Individual Contributor',
  TEAM_MEMBER = 'Team Member',
  OTHER = 'Other',
}
