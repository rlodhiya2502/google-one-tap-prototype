import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule, HttpErrorResponse } from '@angular/common/http';
import { catchError, firstValueFrom, of } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';

interface GoogleCredentialResponse {
  credential: string;
}

interface AuthUser {
  name: string;
}

interface AuthSuccessResponse {
  success: boolean;
  user: AuthUser;
}

interface GoogleAccountsApi {
  id: {
    initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
    prompt: (momentListener?: (notification: GooglePromptMomentNotification) => void) => void;
    disableAutoSelect: () => void;
  };
}

interface GooglePromptMomentNotification {
  isDisplayMoment: () => boolean;
  isDisplayed: () => boolean;
  isNotDisplayed: () => boolean;
  getNotDisplayedReason: () => string;
  isSkippedMoment: () => boolean;
  getSkippedReason: () => string;
}

declare global {
  interface Window {
    google?: {
      accounts: GoogleAccountsApi;
    };
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  template: `
    <main class="container">
      <section class="card">
        <h1>Sign in with Google One Tap</h1>

        @if (statusMessage()) {
          <p class="message">{{ statusMessage() }}</p>
        }

        @if (user()) {
          <h2>Authorized Page</h2>
          <p>Welcome, <strong>{{ user()?.name }}</strong>.</p>
          <button type="button" (click)="signOut()">Sign out</button>
        } @else {
          <p>The One Tap prompt will appear automatically.</p>
          <button type="button" (click)="showPrompt()">Show prompt again</button>
          <p class="hint">If blocked by the browser, allow third-party sign-in prompts for this site.</p>
        }
      </section>
    </main>
  `,
  styles: [
    `
      .container {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 1rem;
        background: linear-gradient(135deg, #f7f7f7 0%, #ebf4ff 100%);
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      }

      .card {
        width: min(100%, 460px);
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 1.5rem;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      }

      h1 {
        margin: 0 0 1rem;
        font-size: 1.4rem;
      }

      h2 {
        margin: 1rem 0 0.5rem;
      }

      p {
        margin: 0.5rem 0;
        color: #334155;
      }

      button {
        margin-top: 0.8rem;
        border: 0;
        border-radius: 10px;
        background: #0f172a;
        color: #fff;
        padding: 0.6rem 1rem;
        font-weight: 600;
        cursor: pointer;
      }

      button:hover {
        background: #1e293b;
      }

      .message {
        background: #fff7ed;
        border: 1px solid #fdba74;
        color: #9a3412;
        border-radius: 10px;
        padding: 0.6rem;
      }

      .hint {
        font-size: 0.9rem;
        color: #475569;
      }
    `,
  ],
})
export class App implements OnInit {
  private readonly clientId = 'REDACTED_GOOGLE_CLIENT_ID';
  private readonly apiBaseUrl = 'http://localhost:8000/api';
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  user = signal<AuthUser | null>(null);
  statusMessage = signal<string>('');

  async ngOnInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    await this.tryLoadExistingSession();

    if (!this.user()) {
      await this.initializeGoogleOneTap();
      this.showPrompt();
    }
  }

  async signOut(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.apiBaseUrl}/logout`, {}, { withCredentials: true }));
    } catch {
      // Ignore backend errors so UI can still reset local state.
    }

    this.user.set(null);
    this.statusMessage.set('Signed out.');

    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
      window.google.accounts.id.prompt();
    }
  }

  showPrompt(): void {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isDisplayMoment() && notification.isDisplayed()) {
          this.statusMessage.set('');
          return;
        }

        if (notification.isNotDisplayed()) {
          const reason = notification.getNotDisplayedReason();
          this.statusMessage.set(`Google One Tap was not displayed (${reason}). Add this exact origin to Google OAuth Authorized JavaScript origins.`);
          return;
        }

        if (notification.isSkippedMoment()) {
          const reason = notification.getSkippedReason();
          this.statusMessage.set(`Google One Tap was skipped (${reason}). You can retry from the button below.`);
        }
      });
      return;
    }

    this.statusMessage.set('Google script is still loading. Please try again in a moment.');
  }

  private async tryLoadExistingSession(): Promise<void> {
    const response = await firstValueFrom(
      this.http
        .get<AuthSuccessResponse>(`${this.apiBaseUrl}/me`, { withCredentials: true })
        .pipe(
          catchError((error: HttpErrorResponse) => {
            if (error.status === 401) {
              return of(null);
            }

            this.statusMessage.set('Unable to reach backend session endpoint. Check backend server is running at http://localhost:8000.');
            return of(null);
          })
        )
    );

    if (response?.success) {
      this.user.set(response.user);
      return;
    }

    this.user.set(null);
  }

  private async initializeGoogleOneTap(): Promise<void> {
    if (window.google?.accounts?.id) {
      this.configureGoogle();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Identity Services script.'));
      document.head.appendChild(script);
    });

    this.configureGoogle();
  }

  private configureGoogle(): void {
    if (!window.google?.accounts?.id) {
      this.statusMessage.set('Google One Tap is not available right now.');
      return;
    }

    window.google.accounts.id.initialize({
      client_id: this.clientId,
      callback: (response: GoogleCredentialResponse) => this.handleCredentialResponse(response),
    });
  }

  private async handleCredentialResponse(response: GoogleCredentialResponse): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.http.post<AuthSuccessResponse>(
          `${this.apiBaseUrl}/auth/google-one-tap`,
          { token: response.credential },
          { withCredentials: true }
        )
      );

      if (result.success) {
        this.user.set(result.user);
        this.statusMessage.set('');
      }
    } catch {
      this.statusMessage.set('Sign-in failed. Please try the prompt again.');
    }
  }
}