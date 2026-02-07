// Setup Vitest (environnement node) pour @casys/infrastructure
// Assure la présence du dossier de couverture temporaire pour v8
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const coverageTmp = join(__dirname, '..', '..', 'coverage', '.tmp');
try {
  if (!existsSync(coverageTmp)) mkdirSync(coverageTmp, { recursive: true });
} catch {
  // noop: si on ne peut pas créer, vitest essayera plus tard
}
// Polyfill minimal de `File` pour Node >= 18 afin d'éviter "ReferenceError: File is not defined".
(() => {
  const g: any = globalThis as any;
  if (typeof g.File === 'undefined' && typeof g.Blob !== 'undefined') {
    class FilePolyfill extends g.Blob {
      name: string;
      lastModified: number;
      constructor(
        bits: any[] = [],
        name = 'unnamed',
        options?: { type?: string; lastModified?: number }
      ) {
        super(bits, options);
        this.name = String(name);
        this.lastModified = options?.lastModified ?? Date.now();
      }
      readonly [Symbol.toStringTag] = 'File';
    }
    g.File = FilePolyfill;
  }
})();
