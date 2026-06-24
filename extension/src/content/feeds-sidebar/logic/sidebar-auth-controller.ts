import type { FeedInfo, UserInfo } from '../types';
import {
  checkAuth,
  handleExpiredSession,
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
}

export function createSidebarAuthController(deps: SidebarAuthControllerDeps): {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  checkAuth: () => Promise<void>;
  handleSignIn: () => Promise<void>;
  handleSignOut: () => Promise<void>;
} {
  const sendMsg = (
    message: Record<string, unknown>
  ): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (response?.error === SESSION_EXPIRED_MESSAGE) {
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
            renderSidebarContent: deps.renderSidebarContent,
          });
        }

        resolve(response || {});
      });
    });

  return {
    sendMsg,
    checkAuth: () =>
      checkAuth({
        sendMsg,
        setCurrentUser: deps.setCurrentUser,
        setAuthErrorMessage: deps.setAuthErrorMessage,
      }),
    handleSignIn: () =>
      handleSignIn({
        sendMsg,
        setIsLoading: deps.setIsLoading,
        setAuthErrorMessage: deps.setAuthErrorMessage,
        renderSidebarContent: deps.renderSidebarContent,
        loadFeeds: deps.loadFeeds,
        setCurrentUser: deps.setCurrentUser,
      }),
    handleSignOut: () =>
      handleSignOut({
        sendMsg,
        setCurrentUser: deps.setCurrentUser,
        setFeeds: (feeds) => {
          deps.setFeeds(feeds as FeedInfo[]);
          deps.resetSignedOutState();
        },
        renderSidebarContent: deps.renderSidebarContent,
      }),
  };
}
