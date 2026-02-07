import { defineConfig } from 'tsup';

export default defineConfig((_options) => ({
  entry: ['src/server.ts'],
  format: ['esm'],
  dts: false, // Désactivé pour éviter l'erreur OOM dans le contexte du turborepo
  splitting: true, // Activer le code splitting pour réduire la taille des chunks
  sourcemap: true, // Maintenu pour le débogage
  clean: true,
  target: 'node22',
  platform: 'node',
  shims: false,
  treeshake: true,
  skipNodeModulesBundle: true,
  // Garder les packages internes comme externes (approche propre avec Turbo)
  external: [
    '@casys/core',
    '@casys/application',
    '@casys/infrastructure',
    '@casys/shared'
  ],
  // Commentaire: Cette configuration est temporaire pour contourner l'erreur OOM
  // À restaurer après résolution du problème sous-jacent:
  // dts: !options.watch,
}));
