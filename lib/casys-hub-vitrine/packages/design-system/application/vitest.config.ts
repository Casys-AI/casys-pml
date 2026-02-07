/// <reference types="vitest" />

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@casys/application',
    globals: true,
    environment: 'node',
    isolate: true,
    pool: 'threads',
    poolOptions: { threads: { maxThreads: 1, minThreads: 1 } },
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      exclude: [
        'src/ports/**',
        'src/utils/logger.ts',
        'src/schemas/**',
        '**/test-results/**',
        'coverage/**',
        'src/types/**',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@casys/core': new URL('../core/src', import.meta.url).pathname,
      '@casys/infrastructure': new URL('../infrastructure/src', import.meta.url).pathname,
      '@casys/application': new URL('./src', import.meta.url).pathname,
      '@casys/api': new URL('../api/src', import.meta.url).pathname,
    },
  },
});
