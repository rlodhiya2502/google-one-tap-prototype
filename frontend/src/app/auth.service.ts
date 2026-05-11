import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

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
    try {
      const response = await firstValueFrom(
        this.http.get<AuthSuccessResponse>(`${this.apiBaseUrl}/me`, { withCredentials: true })
      );

      if (response.success) {
        this.user.set(response.user);
        return true;
      }

      this.user.set(null);
      return false;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.user.set(null);
        return false;
      }

      throw error;
    }
  }

  async signInWithGoogleAccessToken(accessToken: string): Promise<boolean> {
    const response = await firstValueFrom(
      this.http.post<AuthSuccessResponse>(
        `${this.apiBaseUrl}/auth/google-access-token`,
        { accessToken },
        { withCredentials: true }
      )
    );

    if (response.success) {
      this.user.set(response.user);
      return true;
    }

    this.user.set(null);
    return false;
  }

  async signOut(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.apiBaseUrl}/logout`, {}, { withCredentials: true }));
    } finally {
      this.user.set(null);
    }
  }
}
