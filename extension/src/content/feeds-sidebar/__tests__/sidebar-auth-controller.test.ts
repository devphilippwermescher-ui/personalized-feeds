import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSidebarAuthController } from '../logic/sidebar-auth-controller';
import { SESSION_EXPIRED_MESSAGE } from '../logic/sidebar-session';
import type { UserInfo } from '../types';

type MessageCallback = (response?: Record<string, unknown>) => void;

function createController() {
  const callbacks = new Map<string, MessageCallback[]>();
  const sendMessage = vi.fn((message: Record<string, unknown>, callback: MessageCallback) => {
    const type = String(message.type);
    callbacks.set(type, [...(callbacks.get(type) || []), callback]);
  });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });

  const setAuthErrorMessage = vi.fn();
  const renderSidebarContent = vi.fn();
  let currentUser: UserInfo | null = {
    userId: 'user-1',
    displayName: 'Example User',
    email: 'user@example.com',
    photoURL: '',
  };
  const controller = createSidebarAuthController({
    closeModal: vi.fn(),
    getCurrentUser: () => currentUser,
    setCurrentUser: (user) => {
      currentUser = user;
    },
    setFeeds: vi.fn(),
    resetSignedOutState: vi.fn(),
    setExpandedFeedId: vi.fn(),
    clearActiveMemberEditor: vi.fn(),
    setAuthErrorMessage,
    setIsLoading: vi.fn(),
    setIsInitializing: vi.fn(),
    renderSidebarContent,
    loadFeeds: vi.fn(async () => undefined),
    loadPlan: vi.fn(async () => undefined),
    setIsPremium: vi.fn(),
  });

  return {
    controller,
    respond(type: string, response: Record<string, unknown>) {
      const callback = callbacks.get(type)?.shift();
      if (!callback) throw new Error(`No pending ${type} message`);
      callback(response);
    },
    setAuthErrorMessage,
    renderSidebarContent,
    setCurrentUser: (user: UserInfo | null) => {
      currentUser = user;
    },
    getCurrentUser: () => currentUser,
  };
}

describe('sidebar auth controller', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps intentional sign-out free of stale session-expired errors', async () => {
    const { controller, respond, setAuthErrorMessage, renderSidebarContent } = createController();
    const staleRequest = controller.sendMsg({ type: 'FEEDS_GET_FEEDS' });
    const signOut = controller.handleSignOut();

    respond('FEEDS_SIGN_OUT', { success: true });
    await signOut;
    respond('FEEDS_GET_FEEDS', { error: SESSION_EXPIRED_MESSAGE });
    await staleRequest;

    expect(setAuthErrorMessage).toHaveBeenCalledWith('');
    expect(setAuthErrorMessage).not.toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE);
    expect(renderSidebarContent).toHaveBeenCalledTimes(1);
  });

  it('still reports an unexpected expired session', async () => {
    const { controller, respond, setAuthErrorMessage } = createController();
    const request = controller.sendMsg({ type: 'FEEDS_GET_FEEDS' });

    respond('FEEDS_GET_FEEDS', { error: SESSION_EXPIRED_MESSAGE });
    await request;

    expect(setAuthErrorMessage).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE);
  });

  it('does not report an expired session for a request started after intentional sign-out', async () => {
    const { controller, respond, setAuthErrorMessage } = createController();
    const signOut = controller.handleSignOut();

    respond('FEEDS_SIGN_OUT', { success: true });
    await signOut;

    const signedOutRequest = controller.sendMsg({ type: 'PLAN_GET' });
    respond('PLAN_GET', { error: SESSION_EXPIRED_MESSAGE });
    await signedOutRequest;

    expect(setAuthErrorMessage).not.toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE);
  });

  it('ignores a signed-out response that arrives during a new sign-in', async () => {
    const { controller, respond, setAuthErrorMessage } = createController();
    const signOut = controller.handleSignOut();
    respond('FEEDS_SIGN_OUT', { success: true });
    await signOut;

    const signedOutRequest = controller.sendMsg({ type: 'PLAN_GET' });
    const signIn = controller.handleSignIn();

    respond('PLAN_GET', { error: SESSION_EXPIRED_MESSAGE });
    respond('FEEDS_SIGN_IN', { success: false, error: 'Google sign-in was cancelled.' });
    await Promise.all([signedOutRequest, signIn]);

    expect(setAuthErrorMessage).not.toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE);
  });
});
