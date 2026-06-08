import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const nestedFirebaseModules = path.resolve(
  __dirname,
  'node_modules/firebase/node_modules',
);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      shared: path.resolve(__dirname, '../shared'),
      '@firebase/auth': path.resolve(nestedFirebaseModules, '@firebase/auth'),
    },
    dedupe: ['firebase', '@firebase/app', '@firebase/auth', '@firebase/firestore'],
  },
  optimizeDeps: {
    include: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
  },
});
