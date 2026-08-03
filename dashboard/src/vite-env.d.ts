/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXTENSION_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

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
