export class LoginResponse {
  userId: string;
  name: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  resetRequired?: boolean;
  status?: string;
}
