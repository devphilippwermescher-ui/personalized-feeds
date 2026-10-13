import type { EmailPasswordSignInInput, EmailPasswordSignUpInput, FeedInfo, UserInfo } from '../types';
import {
  checkAuth,
  handleExpiredSession,
  handleEmailSignIn,
  handleEmailSignUp,
  handleSignIn,
  handleSignOut,
  SESSION_EXPIRED_MESSAGE,
} from './sidebar-session';

interface SidebarAuthControllerDeps {
  closeModal: () => void;
  getCurrentUser: () => UserInfo | null;
  setCurrentUser: (user: UserInfo | null) => void;
  setFeeds: (feeds: FeedInfo[]) => void;
  resetSignedOutState: () => void;
  setExpandedFeedId: (feedId: string | null) => void;
  clearActiveMemberEditor: () => void;
  setAuthErrorMessage: (message: string) => void;
  setIsLoading: (value: boolean) => void;
  setIsInitializing: (value: boolean) => void;
  renderSidebarContent: () => void;
  loadFeeds: () => Promise<void>;
  loadPlan: (force?: boolean) => Promise<void>;
  setIsPremium: (value: boolean) => void;
}

export function createSidebarAuthController(deps: SidebarAuthControllerDeps): {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  checkAuth: () => Promise<void>;
  handleSignIn: () => Promise<void>;
  handleEmailSignIn: (input: EmailPasswordSignInInput) => Promise<void>;
  handleEmailSignUp: (input: EmailPasswordSignUpInput) => Promise<void>;
  handleSignOut: () => Promise<void>;
} {
  let authSessionRevision = 0;
  let authTransition: 'idle' | 'signing-in' | 'signing-out' = 'idle';
  let pendingAuthentication: Promise<void> | null = null;

  const sendMsg = (message: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const requestSessionRevision = authSessionRevision;
    const startedWithAuthenticatedUser = deps.getCurrentUser() !== null;
    const startedDuringAuthTransition =
      authTransition !== 'idle' ||
      message.type === 'FEEDS_SIGN_IN' ||
      message.type === 'FEEDS_EMAIL_SIGN_IN' ||
      message.type === 'FEEDS_EMAIL_SIGN_UP' ||
      message.type === 'FEEDS_SIGN_OUT';

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        const belongsToCurrentSession = requestSessionRevision === authSessionRevision;
        if (
          response?.error === SESSION_EXPIRED_MESSAGE &&
          belongsToCurrentSession &&
          startedWithAuthenticatedUser &&
          !startedDuringAuthTransition &&
          authTransition === 'idle'
        ) {
          authSessionRevision += 1;
          handleExpiredSession({
            closeModal: deps.closeModal,
            setCurrentUser: deps.setCurrentUser,
            setFeeds: (feeds) => {
              deps.setFeeds(feeds as FeedInfo[]);
            },
            setSharedFeeds: () => {
              deps.resetSignedOutState();
            },
            setExpandedFeedId: deps.setExpandedFeedId,
            setActiveMemberEditor: deps.clearActiveMemberEditor,
            setAuthErrorMessage: deps.setAuthErrorMessage,
            setIsLoading: deps.setIsLoading,
            setIsInitializing: deps.setIsInitializing,
            setIsPremium: deps.setIsPremium,
            renderSidebarContent: deps.renderSidebarContent,
          });
        }

        resolve(response || {});
      });
    });
  };

  function runAuthentication(run: () => Promise<void>): Promise<void> {
    if (pendingAuthentication) {
      return pendingAuthentication;
    }

    authSessionRevision += 1;
    authTransition = 'signing-in';

    const attempt = run().finally(() => {
      authSessionRevision += 1;
      authTransition = 'idle';
      if (pendingAuthentication === attempt) {
        pendingAuthentication = null;
      }
    });
    pendingAuthentication = attempt;
    return attempt;
  }

  const authenticationDeps = {
    sendMsg,
    setIsLoading: deps.setIsLoading,
    setAuthErrorMessage: deps.setAuthErrorMessage,
    renderSidebarContent: deps.renderSidebarContent,
    loadFeeds: deps.loadFeeds,
    loadPlan: deps.loadPlan,
    setCurrentUser: deps.setCurrentUser,
  };

  return {
    sendMsg,
    checkAuth: () =>
      checkAuth({
        sendMsg,
        setCurrentUser: deps.setCurrentUser,
        setAuthErrorMessage: deps.setAuthErrorMessage,
      }),
    handleSignIn: () => runAuthentication(() => handleSignIn(authenticationDeps)),
    handleEmailSignIn: (input) => runAuthentication(() => handleEmailSignIn(input, authenticationDeps)),
    handleEmailSignUp: (input) => runAuthentication(() => handleEmailSignUp(input, authenticationDeps)),
    handleSignOut: async () => {
      authSessionRevision += 1;
      authTransition = 'signing-out';

      try {
        await handleSignOut({
          sendMsg,
          setCurrentUser: deps.setCurrentUser,
          setFeeds: (feeds) => {
            deps.setFeeds(feeds as FeedInfo[]);
            deps.resetSignedOutState();
          },
          setIsPremium: deps.setIsPremium,
          setAuthErrorMessage: deps.setAuthErrorMessage,
          renderSidebarContent: deps.renderSidebarContent,
        });
      } finally {
        authSessionRevision += 1;
        authTransition = 'idle';
      }
    },
  };
}
