export interface TokenClientResponse {
  access_token?: string;
  error?: string;
}

export interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

export interface TokenClientErrorResponse {
  type: string;
}

export interface GoogleOauth2Api {
  initTokenClient: (options: {
    client_id: string;
    scope: string;
    callback: (response: TokenClientResponse) => void;
    error_callback?: (error: TokenClientErrorResponse) => void;
  }) => TokenClient;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleOauth2Api;
      };
    };
  }
}
