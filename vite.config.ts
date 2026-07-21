import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Absolute root avoids Windows drive-letter case mismatches (d: vs D:) that break Vitest.
const root = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
// GitHub Pages project site: https://DaKingKong.github.io/xu-bazaar/
export default defineConfig({
  root,
  base: '/xu-bazaar/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
