export class ProjectDto {
  id: number;
  name: string;
  description: string;
  photoUrl: string;
  files: Array<{
    name: string;
    url: string;
    size: number;
    type: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}