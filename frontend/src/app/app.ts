import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';

// Declare the Google namespace to prevent TypeScript errors
declare var google: any;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  template: `
    <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans">
      <div class="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Google One Tap Prototype</h1>

        @if (clientIdError()) {
          <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 text-left">
            <p class="text-sm text-yellow-700">
              <strong>Action Required:</strong> To resolve the console errors and test the sign-in prompt, you must replace the placeholder <code>YOUR_GOOGLE_CLIENT_ID</code> in the <code>app.ts</code> file with your actual Google OAuth 2.0 Client ID.
            </p>
          </div>
        } @else if (!user()) {
          <p class="text-gray-600 mb-4">Please sign in to continue.</p>
          <p class="text-sm text-gray-500 mb-8">The Google One Tap prompt should appear shortly. If you closed it, reload the page.</p>
          
          <!-- Fallback button container in case One Tap fails or is closed -->
          <div id="g_id_onload" class="flex justify-center"></div>
        } @else {
          <div class="flex flex-col items-center">
            <img [src]="user()?.picture" alt="Profile Picture" class="w-20 h-20 rounded-full mb-4 border-2 border-gray-200">
            <h2 class="text-xl font-semibold text-gray-800">{{ user()?.name }}</h2>
            <p class="text-gray-600 mb-6">{{ user()?.email }}</p>
            
            <button 
              (click)="signOut()" 
              class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
            >
              Sign Out
            </button>
          </div>
        }

      </div>
    </div>
  `
})
export class App implements OnInit {
  // Replace this with your actual Google Client ID
  private clientId = 'REDACTED_GOOGLE_CLIENT_ID ';
  
  // URL to your FlightPHP backend (update this based on your cPanel setup)
  private backendUrl = 'http://localhost:8000/api/auth';

  private http = inject(HttpClient);
  
  // Signal to hold authenticated user data
  user = signal<any>(null);
  
  // Signal to track if the placeholder client ID is still being used
  clientIdError = signal<boolean>(false);

  ngOnInit() {
    // Check if the placeholder is still present before initialising the script
    if (this.clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
      this.clientIdError.set(true);
      return;
    }
    
    this.initialiseGoogleSignIn();
  }

  private initialiseGoogleSignIn() {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      google.accounts.id.initialize({
        client_id: this.clientId,
        callback: this.handleCredentialResponse.bind(this),
        // Enable the Federated Credential Management API (FedCM)
        use_fedcm_for_prompt: true 
      });

      // Display the One Tap prompt
      google.accounts.id.prompt();
    };
    document.head.appendChild(script);
  }

  private handleCredentialResponse(response: any) {
    // The response contains a JWT (JSON Web Token) credential from Google
    const token = response.credential;

    // Send the token to the FlightPHP backend for verification
    this.http.post(this.backendUrl, { token }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.user.set(res.user);
        }
      },
      error: (err) => {
        console.error('Authentication failed on the backend', err);
      }
    });
  }

  signOut() {
    this.user.set(null);
    // Revoke the Google session locally and prompt again
    google.accounts.id.disableAutoSelect();
    google.accounts.id.prompt();
  }
}