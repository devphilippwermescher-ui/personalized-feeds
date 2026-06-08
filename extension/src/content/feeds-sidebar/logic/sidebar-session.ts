import type { UserInfo } from '../types';

interface SidebarSessionDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  renderSidebarContent: () => void;
  loadFeeds: () => Promise<void>;
  init: () => void;
  getCurrentUser: () => UserInfo | null;
  setCurrentUser: (user: UserInfo | null) => void;
  setFeeds: (feeds: unknown[]) => void;
  getSidebarOpen: () => boolean;
  setSidebarOpen: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  setIsInitializing: (value: boolean) => void;
  getIsPremium: () => boolean;
  setIsPremium: (value: boolean) => void;
  setAuthErrorMessage: (value: string) => void;
  getSidebarEl: () => HTMLElement | null;
  getTriggerBtn: () => HTMLElement | null;
  closeModal?: () => void;
  setExpandedFeedId?: (value: string | null) => void;
  setSharedFeeds?: (feeds: unknown[]) => void;
  setActiveMemberEditor?: (value: null) => void;
}

const SIDEBAR_INIT_TIMEOUT_MS = 12000;
export const SESSION_EXPIRED_MESSAGE = 'Session expired, please sign in again.';

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function checkAuth(deps: Pick<SidebarSessionDeps, 'sendMsg' | 'setCurrentUser' | 'setAuthErrorMessage'>): Promise<void> {
  const resp = await deps.sendMsg({ type: 'FEEDS_GET_AUTH_STATE' });
  if (resp?.isAuthenticated) {
    deps.setAuthErrorMessage('');
    deps.setCurrentUser({
      userId: resp.userId as string,
      displayName: (resp.displayName as string) || '',
      email: (resp.email as string) || '',
      photoURL: (resp.photoURL as string) || '',
    });
  } else {
    deps.setCurrentUser(null);
  }
}

export function handleExpiredSession(
  deps: Pick<
    SidebarSessionDeps,
    | 'setCurrentUser'
    | 'setFeeds'
    | 'setAuthErrorMessage'
    | 'renderSidebarContent'
    | 'setIsLoading'
    | 'setIsInitializing'
    | 'closeModal'
    | 'setExpandedFeedId'
    | 'setSharedFeeds'
    | 'setActiveMemberEditor'
  >
): void {
  deps.closeModal?.();
  deps.setCurrentUser(null);
  deps.setFeeds([]);
  deps.setSharedFeeds?.([]);
  deps.setExpandedFeedId?.(null);
  deps.setActiveMemberEditor?.(null);
  deps.setAuthErrorMessage(SESSION_EXPIRED_MESSAGE);
  deps.setIsLoading(false);
  deps.setIsInitializing(false);
  deps.renderSidebarContent();
}

export async function handleSignIn(
  deps: Pick<SidebarSessionDeps, 'sendMsg' | 'setIsLoading' | 'setAuthErrorMessage' | 'renderSidebarContent' | 'loadFeeds' | 'setCurrentUser'>
): Promise<void> {
  deps.setIsLoading(true);
  deps.setAuthErrorMessage('');
  deps.renderSidebarContent();

  const resp = await deps.sendMsg({ type: 'FEEDS_SIGN_IN' });
  if (resp?.success) {
    await checkAuth(deps);
    await deps.loadFeeds();
  } else {
    deps.setAuthErrorMessage((resp?.error as string) || 'Sign in failed');
  }

  deps.setIsLoading(false);
  deps.renderSidebarContent();
}

export async function handleSignOut(
  deps: Pick<SidebarSessionDeps, 'sendMsg' | 'setCurrentUser' | 'setFeeds' | 'renderSidebarContent'>
): Promise<void> {
  await deps.sendMsg({ type: 'FEEDS_SIGN_OUT' });
  deps.setCurrentUser(null);
  deps.setFeeds([]);
  deps.renderSidebarContent();
}

export function toggleSidebar(
  deps: Pick<SidebarSessionDeps, 'getSidebarOpen' | 'setSidebarOpen' | 'getSidebarEl' | 'getTriggerBtn' | 'setIsInitializing' | 'renderSidebarContent' | 'setIsPremium' | 'getIsPremium' | 'getCurrentUser' | 'loadFeeds' | 'sendMsg' | 'setCurrentUser' | 'setAuthErrorMessage'>
): void {
  const nextOpen = !deps.getSidebarOpen();
  deps.setSidebarOpen(nextOpen);
  const overlay = document.getElementById('lfa-sidebar-overlay');

  if (nextOpen) {
    deps.getSidebarEl()?.classList.add('lfa-sidebar-open');
    deps.getTriggerBtn()?.classList.add('lfa-trigger-hidden');
    overlay?.classList.add('visible');
    deps.setIsInitializing(true);
    deps.setAuthErrorMessage('');
    deps.renderSidebarContent();
    chrome.storage.local.get(['pf_userPlan'], (result) => {
      deps.setIsPremium(result.pf_userPlan === 'premium');
      void withTimeout(
        (async () => {
          await checkAuth(deps);
          if (deps.getCurrentUser()) {
            await deps.loadFeeds();
          }
        })(),
        SIDEBAR_INIT_TIMEOUT_MS,
        'Sidebar initialization timed out'
      )
        .catch((error) => {
          deps.setAuthErrorMessage(
            error instanceof Error ? error.message : 'Failed to initialize sidebar'
          );
        })
        .finally(() => {
          deps.setIsInitializing(false);
          deps.renderSidebarContent();
        });
    });
  } else {
    deps.getSidebarEl()?.classList.remove('lfa-sidebar-open');
    deps.getTriggerBtn()?.classList.remove('lfa-trigger-hidden');
    overlay?.classList.remove('visible');
    deps.setIsInitializing(false);
  }
}

export function ensureInit(
  deps: Pick<SidebarSessionDeps, 'setIsPremium' | 'init'>
): void {
  chrome.storage.local.get(['pf_userPlan'], (result) => {
    deps.setIsPremium(result.pf_userPlan === 'premium');
    deps.init();
  });

  setTimeout(() => {
    if (document.getElementById('lfa-feeds-trigger-btn')) return;
    chrome.storage.local.get(['pf_userPlan'], (result) => {
      deps.setIsPremium(result.pf_userPlan === 'premium');
      deps.init();
    });
  }, 500);
}

export function destroySidebar(
  deps: Pick<SidebarSessionDeps, 'setSidebarOpen' | 'setIsInitializing'> & {
    removeStyles?: boolean;
    clearRefs: () => void;
  }
): void {
  document.getElementById('lfa-sidebar')?.remove();
  document.getElementById('lfa-sidebar-overlay')?.remove();
  document.getElementById('lfa-feeds-trigger-btn')?.remove();
  if (deps.removeStyles !== false) {
    document.getElementById('lfa-sidebar-styles')?.remove();
  }
  deps.clearRefs();
  deps.setSidebarOpen(false);
  deps.setIsInitializing(false);
}
