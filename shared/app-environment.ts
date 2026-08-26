export type AppEnvironment = 'development' | 'staging' | 'production';

declare const __APP_ENV__: AppEnvironment | 'auto' | undefined;

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
