import type { SectionWriteResult } from '../../schemas/agents/section-writer.schemas';

/** Port: Section Writer - action: write section */
export interface SectionWriterWriteSectionPort {
  /** Chemin générique (LLM/agent) */
  invoke(input: string): Promise<string>;
  /** Chemin typé optionnel */
  writeSection?(input: unknown): Promise<SectionWriteResult>;
}

export type ISectionWriterWriteSectionPort = SectionWriterWriteSectionPort;
