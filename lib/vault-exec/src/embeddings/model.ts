export interface Embedder {
  load(): Promise<void>;
  encode(text: string): Promise<number[]>;
  isLoaded(): boolean;
  dispose(): Promise<void>;
}

/** BGE-M3 embedder using @huggingface/transformers */
export class BGEEmbedder implements Embedder {
  private model: any = null;
  private loading: Promise<void> | null = null;

  async load(): Promise<void> {
    if (this.model) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      this.model = await pipeline("feature-extraction", "Xenova/bge-m3");
    })();
    await this.loading;
    this.loading = null;
  }

  async encode(text: string): Promise<number[]> {
    if (!this.model) await this.load();
    const output = await this.model(text, { pooling: "cls", normalize: true });
    return Array.from(output.data as Float32Array).slice(0, 1024);
  }

  isLoaded(): boolean { return this.model !== null; }

  async dispose(): Promise<void> {
    this.model = null;
  }
}

/** Embedding model with convenience methods for vault notes */
export class EmbeddingModel {
  constructor(private embedder: Embedder) {}

  async encode(text: string): Promise<number[]> {
    return this.embedder.encode(text);
  }

  async encodeNote(name: string, body: string): Promise<number[]> {
    return this.embedder.encode(`# ${name}\n\n${body.trim()}`);
  }

  isLoaded(): boolean { return this.embedder.isLoaded(); }
  async load(): Promise<void> { await this.embedder.load(); }
  async dispose(): Promise<void> { await this.embedder.dispose(); }
}
