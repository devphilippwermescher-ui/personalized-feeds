import { describe, expect, it, vi } from 'vitest';
import { handleEmailSignIn, handleEmailSignUp, handleSignIn } from '../logic/sidebar-session';

function createAuthenticationDeps() {
  const events: string[] = [];
  const sendMsg = vi.fn(async (message: Record<string, unknown>) => {
    events.push(`message:${String(message.type)}`);
    if (message.type === 'FEEDS_GET_AUTH_STATE') {
      return {
        isAuthenticated: true,
        userId: 'user-1',
        displayName: 'Example User',
        email: 'user@example.com',
      };
    }
    return { success: true };
  });

  return {
    events,
    deps: {
      sendMsg,
      setIsLoading: (value: boolean) => events.push(`loading:${value}`),
      setAuthErrorMessage: vi.fn(),
      renderSidebarContent: () => events.push('render'),
      loadFeeds: async () => {
        events.push('load-feeds');
      },
      loadPlan: async () => {
        events.push('load-plan');
      },
      setCurrentUser: vi.fn(),
    },
    sendMsg,
  };
}

describe('sidebar authentication session', () => {
  it.each([
    {
      name: 'Google sign-in',
      authType: 'FEEDS_SIGN_IN',
      run: (deps: ReturnType<typeof createAuthenticationDeps>['deps']) => handleSignIn(deps),
    },
    {
      name: 'email sign-in',
      authType: 'FEEDS_EMAIL_SIGN_IN',
      run: (deps: ReturnType<typeof createAuthenticationDeps>['deps']) =>
        handleEmailSignIn({ email: 'user@example.com', password: 'password' }, deps),
    },
    {
      name: 'email registration',
      authType: 'FEEDS_EMAIL_SIGN_UP',
      run: (deps: ReturnType<typeof createAuthenticationDeps>['deps']) =>
        handleEmailSignUp(
          {
            firstName: 'Example',
            lastName: 'User',
            email: 'user@example.com',
            password: 'password',
            acceptedPersonalData: true,
          },
          deps
        ),
    },
  ])('starts Profile Visitors after $name has rendered the authenticated sidebar', async ({ authType, run }) => {
    const { deps, events, sendMsg } = createAuthenticationDeps();

    await run(deps);

    expect(sendMsg).toHaveBeenCalledWith(expect.objectContaining({ type: authType, deferPostAuthWork: true }));
    expect(events.indexOf('load-feeds')).toBeLessThan(events.indexOf('message:FEEDS_AUTH_SURFACE_READY'));
    expect(events.slice(-3)).toEqual(['loading:false', 'render', 'message:FEEDS_AUTH_SURFACE_READY']);
  });
});
