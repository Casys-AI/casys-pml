import { defineConfig } from 'tsup';

export default defineConfig(options => ({
  entry: ['src/**/*.ts'],
  format: ['esm'],
  // Éviter la régénération DTS en watch (bruit + courses au démarrage)
  dts: !options.watch,
  splitting: false,
  sourcemap: true,
  target: 'node22',
  clean: !options.watch,
}));
