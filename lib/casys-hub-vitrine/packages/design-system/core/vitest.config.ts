/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@casys/core',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    reporters: ['default'],
    outputFile: {
      json: 'test-results/results.json',
      html: 'test-results',
    },
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/domain/services/**/*.ts'],
      exclude: ['**/__tests__/**', '**/*.test.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
