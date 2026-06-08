/// <reference types="vite/client" />

interface Window {
  chrome?: {
    runtime?: {
      lastError?: {
        message: string;
      };
      sendMessage: (
        extensionId: string,
        message: unknown,
        callback: (response?: unknown) => void
      ) => void;
    };
  };
}
