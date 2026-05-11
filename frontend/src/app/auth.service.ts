import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { authDebug } from './auth-debug';

export interface AuthUser {
  name: string;
}

interface AuthSuccessResponse {
  success: boolean;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiBaseUrl = 'http://localhost:8000/api';
  private readonly http = inject(HttpClient);

  readonly user = signal<AuthUser | null>(null);

  async loadSession(): Promise<boolean> {
    authDebug('session.load.start');
    try {
      const response = await firstValueFrom(
        this.http.get<AuthSuccessResponse>(`${this.apiBaseUrl}/me`, { withCredentials: true })
      );

      if (response.success) {
        this.user.set(response.user);
        authDebug('session.load.success');
        return true;
      }

      this.user.set(null);
      authDebug('session.load.empty');
      return false;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.user.set(null);
        authDebug('session.load.unauthorized');
        return false;
      }

      authDebug('session.load.failed', {
        errorType: error instanceof HttpErrorResponse ? 'http' : 'unknown',
        status: error instanceof HttpErrorResponse ? error.status : undefined,
      });
      throw error;
    }
  }

  async signInWithGoogleAccessToken(accessToken: string): Promise<boolean> {
    authDebug('signin.accessToken.start', { hasToken: !!accessToken });
    const response = await firstValueFrom(
      this.http.post<AuthSuccessResponse>(
        `${this.apiBaseUrl}/auth/google-access-token`,
        { accessToken },
        { withCredentials: true }
      )
    );

    if (response.success) {
      this.user.set(response.user);
      authDebug('signin.accessToken.success');
      return true;
    }

    this.user.set(null);
    authDebug('signin.accessToken.rejected');
    return false;
  }

  async signOut(): Promise<void> {
    authDebug('signout.start');
    try {
      await firstValueFrom(this.http.post(`${this.apiBaseUrl}/logout`, {}, { withCredentials: true }));
    } finally {
      this.user.set(null);
      authDebug('signout.complete');
    }
  }
}
