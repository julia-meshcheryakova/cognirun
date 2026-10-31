import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'android/**',
      'marketing/**',
      'pitch/**',
      'playwright-report/**',
      'test-results/**',
      '**/.wrangler/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['web/src/**/*.js'],
    languageOptions: { globals: { ...globals.browser, __APP_VERSION__: 'readonly' } },
  },
  {
    files: [
      'web/test/**/*.mjs',
      'web/vite.config.js',
      'question-server/**/*.{js,mjs}',
      'api/**/*.mjs',
      'functions/**/*.js',
      'scripts/**/*.mjs',
      'e2e/**/*.mjs',
      '*.{js,mjs}',
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
