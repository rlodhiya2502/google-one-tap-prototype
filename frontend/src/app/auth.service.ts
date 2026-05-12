import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { authDebug } from './auth-debug';
import { AuthUser, AuthSuccessResponse, DashboardData, DashboardResponse } from './auth.types';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiBaseUrl = 'http://localhost:8000/api';
  private readonly sessionTokenStorageKey = 'auth:sessionToken';
  private readonly http = inject(HttpClient);

  readonly user = signal<AuthUser | null>(null);
  readonly sessionToken = signal<string | null>(null);

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }

    const existingToken = window.sessionStorage.getItem(this.sessionTokenStorageKey);
    if (existingToken) {
      this.sessionToken.set(existingToken);
    }
  }

  async loadSession(): Promise<boolean> {
    authDebug('session.load.start');
    try {
      const response = await firstValueFrom(
        this.http.get<AuthSuccessResponse>(`${this.apiBaseUrl}/me`, { withCredentials: true }),
      );

      if (response.success) {
        this.user.set(response.user);
        this.setSessionToken(response.sessionToken ?? null);
        authDebug('session.load.success');
        return true;
      }

      this.user.set(null);
      this.setSessionToken(null);
      authDebug('session.load.empty');
      return false;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.user.set(null);
        this.setSessionToken(null);
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
        { withCredentials: true },
      ),
    );

    if (response.success) {
      this.user.set(response.user);
      this.setSessionToken(response.sessionToken ?? null);
      authDebug('signin.accessToken.success');
      return true;
    }

    this.user.set(null);
    this.setSessionToken(null);
    authDebug('signin.accessToken.rejected');
    return false;
  }

  async signOut(): Promise<void> {
    authDebug('signout.start');
    try {
      await firstValueFrom(
        this.http.post(`${this.apiBaseUrl}/logout`, {}, { withCredentials: true }),
      );
    } finally {
      this.user.set(null);
      this.setSessionToken(null);
      authDebug('signout.complete');
    }
  }

  async fetchDashboard(): Promise<DashboardData> {
    authDebug('dashboard.fetch.start');

    const token = this.sessionToken();
    if (!token) {
      authDebug('dashboard.fetch.failed', { reason: 'missing_session_token' });
      throw new HttpErrorResponse({
        status: 401,
        statusText: 'Missing session token',
        error: { message: 'Missing bearer session token.' },
      });
    }

    const response = await firstValueFrom(
      this.http.get<DashboardResponse>(`${this.apiBaseUrl}/dashboard`, {
        withCredentials: true,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
    );

    if (!response.success) {
      authDebug('dashboard.fetch.failed', { reason: 'unsuccessful_response' });
      throw new Error('Dashboard response was not successful.');
    }

    this.user.set(response.user);
    authDebug('dashboard.fetch.success', {
      widgets: response.dashboard.widgets.length,
      permissions: response.dashboard.permissions.length,
    });
    return response.dashboard;
  }

  private setSessionToken(token: string | null): void {
    this.sessionToken.set(token);

    if (typeof window === 'undefined') {
      return;
    }

    if (!token) {
      window.sessionStorage.removeItem(this.sessionTokenStorageKey);
      return;
    }

    window.sessionStorage.setItem(this.sessionTokenStorageKey, token);
  }
}
