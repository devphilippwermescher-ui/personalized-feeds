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
  let isSigningOut = false;

  const sendMsg = (message: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const requestSessionRevision = authSessionRevision;
    const startedDuringSignOut = isSigningOut || message.type === 'FEEDS_SIGN_OUT';

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        const belongsToCurrentSession = requestSessionRevision === authSessionRevision;
        if (response?.error === SESSION_EXPIRED_MESSAGE && belongsToCurrentSession && !startedDuringSignOut) {
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
    handleSignIn: () => handleSignIn(authenticationDeps),
    handleEmailSignIn: (input) => handleEmailSignIn(input, authenticationDeps),
    handleEmailSignUp: (input) => handleEmailSignUp(input, authenticationDeps),
    handleSignOut: async () => {
      authSessionRevision += 1;
      isSigningOut = true;

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
        isSigningOut = false;
      }
    },
  };
}
