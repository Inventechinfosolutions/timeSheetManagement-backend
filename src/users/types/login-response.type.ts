export class LoginResponse {
  userId: string;
  name: string;
  email: string;
  userType: string;
  role?: string | null;
  accessToken: string;
  refreshToken: string;
  resetRequired?: boolean;
  status?: string;
}
