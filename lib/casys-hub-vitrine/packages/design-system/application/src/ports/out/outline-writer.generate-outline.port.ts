import type { ArticleOutline } from '../../schemas/agents/outline-writer.schemas';

/** Port: Outline Writer - action: generate outline */
export interface OutlineWriterGenerateOutlinePort {
  /** Chemin générique (LLM/agent) */
  invoke(input: string): Promise<string>;
  /** Chemin typé optionnel pour certaines implémentations */
  generateOutline?(input: unknown): Promise<ArticleOutline>;
}

export type IOutlineWriterGenerateOutlinePort = OutlineWriterGenerateOutlinePort;
