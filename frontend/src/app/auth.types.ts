export interface AuthUser {
  name: string;
  email: string;
  role: 'admin' | 'instructor' | 'learner';
}

export interface AuthSuccessResponse {
  success: boolean;
  user: AuthUser;
  sessionToken?: string;
  expiresAt?: number;
}

export interface DashboardData {
  widgets: string[];
  permissions: string[];
}

export interface DashboardResponse {
  success: boolean;
  user: AuthUser;
  dashboard: DashboardData;
}
