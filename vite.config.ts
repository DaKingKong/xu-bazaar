import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Absolute root with uppercase Windows drive letter. Pair with
// scripts/run-vitest.mjs (npm test / test:watch) so cwd and the Vitest CLI
// path use the same casing — otherwise suite lookup fails on Git Bash.
function withUppercaseDrive(p: string): string {
  return process.platform === 'win32' ? p.replace(/^([a-zA-Z]):/, (_, d: string) => `${d.toUpperCase()}:`) : p;
}

const root = withUppercaseDrive(path.dirname(fileURLToPath(import.meta.url)));

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
