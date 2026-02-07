/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@casys/shared',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});
