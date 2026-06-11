import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import sessionDatastore from './vite-plugin-session-datastore.mjs';

export default defineConfig({
  plugins: [react(), tailwindcss(), sessionDatastore()],
  // 重要: zaproom はルート相対パスで配信されないため相対パス必須
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
