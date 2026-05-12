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
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.css'],
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
