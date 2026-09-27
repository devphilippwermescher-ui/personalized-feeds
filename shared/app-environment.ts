export type AppEnvironment = 'development' | 'staging' | 'production';

declare const __APP_ENV__: AppEnvironment | 'auto' | undefined;
declare const __USE_FIREBASE_EMULATORS__: boolean | undefined;

export const FIREBASE_EMULATOR_HOST = '127.0.0.1';
export const FIREBASE_EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
  functions: 5001,
} as const;

const FIREBASE_HOST_MARKERS: Array<[string, AppEnvironment]> = [
  ['myfeedpilot-dev', 'development'],
  ['localhost', 'development'],
  ['127.0.0.1', 'development'],
  ['myfeedpilot-staging', 'staging'],
];

function getInjectedEnvironment(): AppEnvironment | 'auto' {
  return typeof __APP_ENV__ === 'undefined' ? 'auto' : __APP_ENV__;
}

export function getAppEnvironment(): AppEnvironment {
  const injectedEnvironment = getInjectedEnvironment();
  if (injectedEnvironment !== 'auto') {
    return injectedEnvironment;
  }

  const hostname = typeof window === 'undefined' ? '' : window.location.hostname;
  const matchedEnvironment = FIREBASE_HOST_MARKERS.find(([marker]) => hostname.includes(marker));

  return matchedEnvironment?.[1] ?? 'production';
}

export function shouldUseFirebaseEmulators(): boolean {
  return typeof __USE_FIREBASE_EMULATORS__ !== 'undefined' && __USE_FIREBASE_EMULATORS__;
}

export function getDashboardOrigin(environment = getAppEnvironment()): string {
  switch (environment) {
    case 'development':
      return 'https://myfeedpilot-dev.web.app';
    case 'staging':
      return 'https://myfeedpilot-staging.web.app';
    case 'production':
      return 'https://myfeedpilot-app.web.app';
  }
}

// The auth helper remains available when the dashboard UI is disabled.
export function getAuthHelperOrigin(environment = getAppEnvironment()): string {
  return getDashboardOrigin(environment);
}
