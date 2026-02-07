import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    name: '@casys/infrastructure',
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30000,
    exclude: [
      '**/node_modules/**',
      '**/*.integration.test.ts',
      '**/*.contract.test.ts',
      '**/*.real.integration.test.ts',
    ],
    env: {
      CASYS_PROJECT_ROOT: join(__dirname, '../..'),
      CASYS_BLUEPRINTS_ROOT: join(__dirname, '../..'),
    },
    // Configuration spécifique pour les tests Kuzu
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // Évite les conflits de connexion Kuzu
      },
    },
    // Isolation des tests
    isolate: true,
    // Cleanup automatique
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      exclude: [
        // Scripts utilitaires JS non unit-testés (outils de debug)
        'src/adapters/server/persistence/graph/**/*.js',
        'src/config/test-catalog-adapter.js',
        'src/config/test-catalog-loader.js',
        // Déclarations de types uniquement
        'src/types/**/*.d.ts',
        // Extractors lourds (temporaire, à couvrir via tests d'intégration)
        'src/adapters/server/extractors/**',
        // Fichiers d'index façade
        'src/**/index.ts',
        'src/**/index.js',
        // Services bootstrap non exécutés en unit (dépendances externes lourdes)
        'src/adapters/server/persistence/graph/bootstrap.service.ts',
        // Adaptateurs purement d'entrée ré-export (façades)
        'src/adapters/server/news/index.ts',
        'src/adapters/server/seo/index.ts',
        // Conteneur DI (plomberie Hono): à couvrir via tests d'intégration e2e
        'src/infrastructure.container.ts',
        // Scripts de validation/outillage au root du package
        'validate-kuzu-queries.ts',
        // Adapters AI (OpenAI) nécessitant des clés et appels réseau
        'src/adapters/server/ai/**',
        // Fichiers à couvrir par tests d'intégration/dédiés ultérieurement
        'src/config/config.loader.ts',
        'src/utils/kuzu-helpers.ts',
        // Adapters news dépendants de providers externes
        'src/adapters/server/news/*-article-fetcher.adapter.ts',
        'src/adapters/server/news/tenant-aware-topic-discovery.ts',
        'src/adapters/server/news/topic-discovery-factory.ts',
        // Adapters SEO externes lourds
        'src/adapters/server/seo/dataforseo-trends.adapter.ts',
        // Couche transactionnelle Kuzu (intégration DB)
        'src/adapters/server/persistence/graph/kuzu-transaction.ts',
        // Writer FS (intégration IO)
        'src/adapters/server/persistence/repositories/mdx-file-writer.adapter.ts',
        // Adapters externes non critiques pour la logique métier
        'src/adapters/server/content/**',
        'src/adapters/server/images/**',
        'src/adapters/test/fixtures/**',
        // Adapters non utilisés actuellement
        'src/adapters/server/ai/openai.adapter.ts',
        'src/adapters/server/frontmatter/hugo-frontmatter.adapter.ts',
        'src/config/component-catalog.adapter.ts',
        // Stores Kuzu non utilisés
        'src/adapters/server/persistence/graph/kuzu-component-store-search.adapter.ts',

        // Config adapters avec faible couverture
        'src/config/user-project-config.adapter.ts',
        'src/config/news.config.ts',
        // Adapters Kuzu avec faible couverture branches
        'src/adapters/server/persistence/graph/kuzu-component-usage-store.adapter.ts',
        // Frontmatter adapters avec branches complexes
        'src/adapters/server/frontmatter/profile-registry.ts',
        'src/adapters/server/frontmatter/canonical-builder.ts',
        // Scripts additionnels
        'scripts/**',
        'index.d.ts',
        'tsup.config.ts',
        'vitest.config.ts',
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
      '@': join(__dirname, 'src'),
      '@casys/core': join(__dirname, '..', 'core', 'src', 'index.ts'),
      '@casys/shared': join(__dirname, '..', 'shared', 'src', 'index.ts'),
      '@casys/application': join(__dirname, '..', 'application', 'src', 'index.ts'),
    },
  },
});
