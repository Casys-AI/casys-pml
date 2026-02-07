/// <reference types="vitest" />
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

// Configuration pour eviter les conflits Vite/Vitest
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    name: '@casys/api',
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'src/**/*.spec.ts', // Exclure d'éventuels anciens tests
    ],
    // Configuration spécifique pour les tests API
    testTimeout: 10000, // Timeout plus long pour les tests d'intégration
    hookTimeout: 10000,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60, // à remonter quand on sera prêts
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      // Alias pour les packages internes
      '@casys/core': resolve(__dirname, '../core/src'),
      '@casys/application': resolve(__dirname, '../application/src'),
      '@casys/infrastructure': resolve(__dirname, '../infrastructure/src'),
      '@casys/shared': resolve(__dirname, '../shared/src'),
      // Alias pour les modules internes du package API
      '@/utils': resolve(__dirname, 'src/utils'),
      '@/middleware': resolve(__dirname, 'src/middleware'),
      '@/routes': resolve(__dirname, 'src/routes'),
      '@/types': resolve(__dirname, 'src/types'),
    },
  },
  // Configuration pour les mocks et les modules externes
  define: {
    // Variables d'environnement pour les tests
    'process.env.NODE_ENV': '"test"',
  },
});
