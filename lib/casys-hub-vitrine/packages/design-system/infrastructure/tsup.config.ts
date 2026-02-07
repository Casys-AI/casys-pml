import { defineConfig } from 'tsup';

export default defineConfig(options => ({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: !options.watch, // Désactiver dts en mode watch
  splitting: false,
  sourcemap: true,
  target: 'node22',
  platform: 'node',
  shims: false,
  treeshake: true,
  skipNodeModulesBundle: true,
  clean: !options.watch,
  // Garder les packages internes comme externes (approche Turbo propre)
  external: ['@casys/core', '@casys/shared'],
  tsconfig: 'tsconfig.json',
  // Copier les fichiers de configuration dans le dossier dist
  publicDir: false,
  onSuccess:
    'mkdir -p dist/config && cp src/config/*.yaml dist/config/ && cp src/config/*.json dist/config/ && cp src/config/*.yaml dist/ && cp src/config/*.json dist/',
}));
