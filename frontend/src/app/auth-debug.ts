const AUTH_DEBUG_KEY = 'auth:debug';

function isAuthDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(AUTH_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export function authDebug(event: string, details?: Record<string, unknown>): void {
  if (!isAuthDebugEnabled()) {
    return;
  }

  if (details) {
    console.info('[auth]', event, details);
    return;
  }

  console.info('[auth]', event);
}
