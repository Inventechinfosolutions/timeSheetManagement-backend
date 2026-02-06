import { Department } from '../../employeeTimeSheet/enums/department.enum';

export class ProjectAttachmentDto {
  id: number;
  fileName: string;
  fileUrl: string;
  fileKey: string;
  modelId?: number;
  createdAt: Date;
}

export class ProjectModelDto {
  id: number;
  modelName: string;
  projectId: number;
  attachments?: ProjectAttachmentDto[];
  createdAt: Date;
  updatedAt: Date;
}

export class ProjectResponseDto {
  id: number;
  projectName: string;
  department: Department;
  description?: string;
  photoUrl?: string;
  photoKey?: string;
  hasModels: boolean;
  models?: ProjectModelDto[];
  attachments?: ProjectAttachmentDto[];
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}
