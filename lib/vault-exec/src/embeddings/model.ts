export interface Embedder {
  load(): Promise<void>;
  encode(text: string): Promise<number[]>;
  isLoaded(): boolean;
  dispose(): Promise<void>;
}

type FeatureExtractionResult = {
  data: ArrayLike<number>;
};

type FeatureExtractionPipeline = (
  text: string,
  options: {
    pooling: "cls";
    normalize: true;
  },
) => Promise<FeatureExtractionResult>;

/** BGE-M3 embedder using @huggingface/transformers */
export class BGEEmbedder implements Embedder {
  private model: FeatureExtractionPipeline | null = null;
  private loading: Promise<void> | null = null;

  async load(): Promise<void> {
    if (this.model) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      const loaded = await pipeline("feature-extraction", "Xenova/bge-m3");
      this.model = loaded as unknown as FeatureExtractionPipeline;
    })();
    await this.loading;
    this.loading = null;
  }

  async encode(text: string): Promise<number[]> {
    await this.load();
    if (!this.model) {
      throw new Error("Embedding model failed to initialize.");
    }
    const output = await this.model(text, { pooling: "cls", normalize: true });
    return Array.from(output.data).slice(0, 1024);
  }

  isLoaded(): boolean {
    return this.model !== null;
  }

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

  isLoaded(): boolean {
    return this.embedder.isLoaded();
  }
  async load(): Promise<void> {
    await this.embedder.load();
  }
  async dispose(): Promise<void> {
    await this.embedder.dispose();
  }
}
