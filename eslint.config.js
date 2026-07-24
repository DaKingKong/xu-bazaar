import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

const reactRefreshPlugin = reactRefresh.default ?? reactRefresh;

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'scripts/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefreshPlugin,
    },
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // 允许以下划线前缀标记「有意保留但未使用」的参数（如契约要求的 rng）。
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Enforce the architecture rule from docs: src/engine must not depend on
  // React or any UI library (see docs/architecture.md).
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'src/engine 必须为纯 TS，不得依赖 React/UI。' },
            { name: 'react-dom', message: 'src/engine 必须为纯 TS，不得依赖 React/UI。' },
            { name: 'framer-motion', message: 'src/engine 必须为纯 TS，不得依赖 React/UI。' },
            { name: 'zustand', message: 'src/engine 必须为纯 TS，不得依赖状态/UI 层。' },
          ],
          patterns: ['**/ui/**', '**/store/**'],
        },
      ],
    },
  },
]);
