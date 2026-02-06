import { Department } from '../../employeeTimeSheet/enums/department.enum';

export class ProjectDocumentFileDto {
  name: string;
  key: string;
  createdAt: string | number | Date;
}

export class ProjectDocumentResponseDto {
  id: number;
  projectName: string;
  description?: string;
  department: Department;
  projectPhotoUrl?: string;
  projectPhotoKey?: string;
  files?: ProjectDocumentFileDto[];
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}


