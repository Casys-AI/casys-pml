// Setup Vitest (environnement node)
// Polyfill minimal de `File` pour Node >= 18 afin d'éviter "ReferenceError: File is not defined".
(() => {
  const g = globalThis as { File?: typeof File; Blob?: typeof Blob };
  if (typeof g.File === 'undefined' && typeof g.Blob !== 'undefined') {
    class FilePolyfill extends g.Blob {
      name: string;
      lastModified: number;
      readonly [Symbol.toStringTag] = 'File';
      constructor(
        bits: BlobPart[] = [],
        name = 'unnamed',
        options?: { type?: string; lastModified?: number }
      ) {
        super(bits, options);
        this.name = String(name);
        this.lastModified = options?.lastModified ?? Date.now();
      }
    }
    g.File = FilePolyfill as unknown as typeof File;
  }
})();
