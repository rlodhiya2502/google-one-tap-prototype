import { Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from './auth.service';
import { authDebug } from './auth-debug';
import { environment } from '../environments/environment';
import { TokenClientResponse, TokenClient, TokenClientErrorResponse } from './login.types';

@Component({
  standalone: true,
  selector: 'app-login-page',
  imports: [CommonModule],
  template: `
    <main class="container">
      <section class="card">
        <h1>Sign in with Google</h1>
        <p>Use the button below to sign in without leaving this app.</p>

        <div class="origin-debug">
          <small
            >Current Origin: <code>{{ currentOrigin }}</code></small
          >
        </div>

        @if (statusMessage()) {
          <p class="message">{{ statusMessage() }}</p>
        }

        <button
          type="button"
          (click)="startGoogleSignIn($event)"
          [disabled]="isBusy() || !isReady()"
        >
          Continue with Google
        </button>
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
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
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
        padding: 0.7rem 1rem;
        font-weight: 600;
        cursor: pointer;
      }

      button:disabled {
        background: #94a3b8;
        cursor: not-allowed;
      }

      button:hover:not(:disabled) {
        background: #1e293b;
      }

      .origin-debug {
        font-size: 0.8rem;
        color: #64748b;
        margin: 0.5rem 0;
        padding: 0.4rem;
        background: #f1f5f9;
        border-radius: 6px;
      }

      .message {
        background: #fff7ed;
        border: 1px solid #fdba74;
        color: #9a3412;
        border-radius: 10px;
        padding: 0.6rem;
      }

      code {
        background: #e2e8f0;
        padding: 0.2rem 0.4rem;
        border-radius: 3px;
        font-family: 'Courier New', monospace;
        word-break: break-all;
      }
    `,
  ],
})
export class LoginPage {
  private readonly clientId = environment.googleClientId;
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  private tokenClient: TokenClient | null = null;
  private popupInProgress = false;

  readonly statusMessage = signal('');
  readonly isBusy = signal(false);
  readonly isReady = signal(false);
  readonly currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    authDebug('login.bootstrap.start', { origin: this.currentOrigin });
    void this.bootstrap();
  }

  startGoogleSignIn(event: MouseEvent): void {
    if (!event.isTrusted) {
      authDebug('login.click.untrusted');
      return;
    }

    if (typeof navigator !== 'undefined' && 'userActivation' in navigator) {
      const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } })
        .userActivation;
      if (activation && !activation.isActive) {
        authDebug('login.click.noUserActivation');
        this.statusMessage.set(
          'User activation is required. Please click Continue with Google again.',
        );
        return;
      }
    }

    if (!this.tokenClient || this.isBusy() || this.popupInProgress) {
      authDebug('login.click.ignored', {
        hasTokenClient: !!this.tokenClient,
        isBusy: this.isBusy(),
        popupInProgress: this.popupInProgress,
      });
      return;
    }

    authDebug('login.popup.requested');
    this.popupInProgress = true;
    this.isBusy.set(true);
    this.statusMessage.set('');
    this.tokenClient.requestAccessToken({ prompt: 'select_account' });
  }

  private async bootstrap(): Promise<void> {
    const ready = await this.waitForGoogleScript();
    if (!ready) {
      authDebug('login.script.unavailable');
      this.statusMessage.set('Google Sign-In script is not available right now.');
      return;
    }

    authDebug('login.script.ready');

    this.tokenClient =
      window.google?.accounts?.oauth2?.initTokenClient({
        client_id: this.clientId,
        scope: 'openid profile email',
        callback: (response: TokenClientResponse) => void this.handleTokenResponse(response),
        error_callback: (error: TokenClientErrorResponse) => this.handleTokenError(error),
      }) || null;

    if (!this.tokenClient) {
      authDebug('login.tokenClient.init.failed');
      this.statusMessage.set('Unable to initialize Google Sign-In.');
      return;
    }

    authDebug('login.tokenClient.init.success');
    this.isReady.set(true);
  }

  private async handleTokenResponse(response: TokenClientResponse): Promise<void> {
    if (response.error || !response.access_token) {
      authDebug('login.token.response.error', {
        hasAccessToken: !!response.access_token,
        error: response.error || 'missing_access_token',
      });
      this.statusMessage.set('Google sign-in was cancelled or blocked.');
      this.popupInProgress = false;
      this.isBusy.set(false);
      return;
    }

    authDebug('login.token.response.success');

    try {
      await this.authService.signInWithGoogleAccessToken(response.access_token);
      authDebug('login.backend.signin.success');
      this.statusMessage.set('');
      await this.router.navigateByUrl('/authorized');
    } catch (error) {
      authDebug('login.backend.signin.failed', {
        errorType: error instanceof HttpErrorResponse ? 'http' : 'unknown',
        status: error instanceof HttpErrorResponse ? error.status : undefined,
      });
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.statusMessage.set('Google token was rejected by backend verification.');
      } else {
        this.statusMessage.set('Sign-in failed. Please try again.');
      }
    } finally {
      this.popupInProgress = false;
      this.isBusy.set(false);
    }
  }

  private handleTokenError(error: TokenClientErrorResponse): void {
    authDebug('login.popup.error', { type: error.type });
    if (error.type === 'popup_failed_to_open' || error.type === 'popup_closed') {
      this.statusMessage.set(
        'Popup was blocked or closed. Please click Continue with Google again.',
      );
    } else {
      this.statusMessage.set('Google sign-in could not be started.');
    }

    this.popupInProgress = false;
    this.isBusy.set(false);
  }

  private async waitForGoogleScript(): Promise<boolean> {
    const maxAttempts = 50;
    let attempts = 0;

    while (!window.google?.accounts?.oauth2 && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    return !!window.google?.accounts?.oauth2;
  }
}
