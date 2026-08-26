import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      shared: path.resolve(__dirname, '../shared'),
    },
    // The repo root and the extension package each carry a Firebase copy.
    // Deduplicating keeps module mocks and instanceof checks consistent.
    dedupe: ['firebase', '@firebase/app', '@firebase/firestore', '@firebase/auth'],
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
