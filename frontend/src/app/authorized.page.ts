import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from './auth.service';
import { DashboardData } from './auth.types';

@Component({
  standalone: true,
  selector: 'app-authorized-page',
  imports: [CommonModule],
  template: `
    <main class="container">
      <section class="card">
        <h1>Authorized Page</h1>

        @if (statusMessage()) {
          <p class="message">{{ statusMessage() }}</p>
        }

        @if (isLoadingDashboard()) {
          <p class="hint">Loading dashboard data...</p>
        }

        <p>
          Welcome, <strong>{{ authService.user()?.name }}</strong
          >.
        </p>
        <p>
          Email: <strong>{{ authService.user()?.email }}</strong>
        </p>
        <p>
          Role: <strong class="role-badge">{{ authService.user()?.role }}</strong>
        </p>

        @if (dashboard()) {
          <div class="section">
            <h2>Dashboard Widgets</h2>
            <ul>
              @for (widget of dashboard()?.widgets; track widget) {
                <li>{{ widget }}</li>
              }
            </ul>
          </div>

          <div class="section">
            <h2>Permissions</h2>
            <ul>
              @for (permission of dashboard()?.permissions; track permission) {
                <li>{{ permission }}</li>
              }
            </ul>
          </div>
        }

        <button type="button" (click)="signOut()">Sign out</button>
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

      h2 {
        margin: 0.8rem 0 0.4rem;
        font-size: 1rem;
      }

      p {
        margin: 0.5rem 0;
        color: #334155;
      }

      ul {
        margin: 0.2rem 0 0.8rem;
        padding-left: 1.2rem;
        color: #334155;
      }

      li {
        margin: 0.2rem 0;
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

      .role-badge {
        display: inline-block;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #0f172a;
      }

      .section {
        margin-top: 0.6rem;
      }

      .hint {
        font-size: 0.9rem;
        color: #475569;
      }
    `,
  ],
})
export class AuthorizedPage {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly statusMessage = signal('');
  readonly dashboard = signal<DashboardData | null>(null);
  readonly isLoadingDashboard = signal(false);

  constructor() {
    void this.ensureSession();
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigateByUrl('/login');
  }

  private async ensureSession(): Promise<void> {
    if (this.authService.user()) {
      await this.loadDashboard();
      return;
    }

    try {
      const hasSession = await this.authService.loadSession();
      if (!hasSession) {
        await this.router.navigateByUrl('/login');
        return;
      }

      await this.loadDashboard();
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        this.statusMessage.set('Unable to load user session.');
      } else {
        this.statusMessage.set('Unexpected error loading session.');
      }
      await this.router.navigateByUrl('/login');
    }
  }

  private async loadDashboard(): Promise<void> {
    this.isLoadingDashboard.set(true);
    this.statusMessage.set('');

    try {
      const data = await this.authService.fetchDashboard();
      this.dashboard.set(data);
    } catch (error) {
      this.dashboard.set(null);
      if (error instanceof HttpErrorResponse && error.status === 403) {
        this.statusMessage.set(
          'You are authenticated but not authorized for this dashboard scope.',
        );
      } else {
        this.statusMessage.set('Failed to load dashboard data.');
      }
    } finally {
      this.isLoadingDashboard.set(false);
    }
  }
}
