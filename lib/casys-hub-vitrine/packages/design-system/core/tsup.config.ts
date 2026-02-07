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
  clean: true,
}));
