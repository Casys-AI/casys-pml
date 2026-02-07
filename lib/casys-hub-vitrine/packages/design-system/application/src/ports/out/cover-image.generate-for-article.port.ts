/** Port: Cover Image - action: generate for article */
import type { GenerateCoverImageCommandDTO, GeneratedCoverImageDTO } from '@casys/shared';

export interface CoverImageGenerateForArticlePort {
  execute(input: GenerateCoverImageCommandDTO): Promise<GeneratedCoverImageDTO | null>;
}

export type ICoverImageGenerateForArticlePort = CoverImageGenerateForArticlePort;
