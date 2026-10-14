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
    setGuestClaimVerificationRequired: vi.fn(),
    setInitialVerificationEmailDeliveryResult: vi.fn(),
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
    sendMessage,
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

  it('reports an expired session only after the auth state confirms sign-out', async () => {
    const { controller, respond, setAuthErrorMessage } = createController();
    const request = controller.sendMsg({ type: 'FEEDS_GET_FEEDS' });

    respond('FEEDS_GET_FEEDS', { error: SESSION_EXPIRED_MESSAGE });
    await vi.waitFor(() => respond('FEEDS_GET_AUTH_STATE', { isAuthenticated: false }));
    await request;

    expect(setAuthErrorMessage).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE);
  });

  it('keeps the signed-in UI when Firebase restores the session after a transient error', async () => {
    const { controller, respond, setAuthErrorMessage, getCurrentUser, renderSidebarContent } = createController();
    const request = controller.sendMsg({ type: 'PLAN_GET' });

    respond('PLAN_GET', { error: SESSION_EXPIRED_MESSAGE });
    await vi.waitFor(() => respond('FEEDS_GET_AUTH_STATE', { isAuthenticated: true, userId: 'user-1' }));
    await request;

    expect(getCurrentUser()?.userId).toBe('user-1');
    expect(setAuthErrorMessage).not.toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE);
    expect(renderSidebarContent).not.toHaveBeenCalled();
  });

  it('keeps the signed-in UI when the confirmation request is inconclusive', async () => {
    const { controller, respond, setAuthErrorMessage, getCurrentUser } = createController();
    const request = controller.sendMsg({ type: 'PLAN_GET' });

    respond('PLAN_GET', { error: SESSION_EXPIRED_MESSAGE });
    await vi.waitFor(() => respond('FEEDS_GET_AUTH_STATE', { error: 'Background unavailable' }));
    await request;

    expect(getCurrentUser()?.userId).toBe('user-1');
    expect(setAuthErrorMessage).not.toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE);
  });

  it('deduplicates session confirmation for simultaneous transient errors', async () => {
    const { controller, respond, sendMessage, setAuthErrorMessage } = createController();
    const planRequest = controller.sendMsg({ type: 'PLAN_GET' });
    const noticeRequest = controller.sendMsg({ type: 'BILLING_NOTICE_GET' });

    respond('PLAN_GET', { error: SESSION_EXPIRED_MESSAGE });
    respond('BILLING_NOTICE_GET', { error: SESSION_EXPIRED_MESSAGE });
    await vi.waitFor(() => {
      expect(sendMessage.mock.calls.filter(([message]) => message.type === 'FEEDS_GET_AUTH_STATE')).toHaveLength(1);
    });
    respond('FEEDS_GET_AUTH_STATE', { isAuthenticated: true, userId: 'user-1' });
    await Promise.all([planRequest, noticeRequest]);

    expect(setAuthErrorMessage).not.toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE);
  });

  it('does not apply a stale failed confirmation after intentional sign-out', async () => {
    const { controller, respond, sendMessage, setAuthErrorMessage } = createController();
    const staleRequest = controller.sendMsg({ type: 'PLAN_GET' });
    respond('PLAN_GET', { error: SESSION_EXPIRED_MESSAGE });
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: 'FEEDS_GET_AUTH_STATE' }, expect.any(Function));
    });

    const signOut = controller.handleSignOut();
    respond('FEEDS_SIGN_OUT', { success: true });
    await signOut;
    respond('FEEDS_GET_AUTH_STATE', { isAuthenticated: false });
    await staleRequest;

    expect(setAuthErrorMessage).not.toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE);
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
