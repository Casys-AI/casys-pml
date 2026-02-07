import { defineConfig } from 'tsup';

export default defineConfig(options => ({
  entry: ['src/index.ts'],
  format: ['esm'],
  // Éviter la génération DTS en mode watch (bruit + courses au démarrage)
  dts: !options.watch,
  splitting: false,
  sourcemap: true,
  target: 'node22',
  platform: 'node',
  shims: false,
  treeshake: true,
  skipNodeModulesBundle: true,
  clean: !options.watch, // Ne pas nettoyer en watch pour préserver le cache build
  // Garder les packages internes comme externes (approche Turbo propre)
  external: ['@casys/core', '@casys/shared'],
}));
