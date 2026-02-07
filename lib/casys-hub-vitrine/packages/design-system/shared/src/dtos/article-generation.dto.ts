export interface ArticleGenerationResultDTO {
  success: boolean;
  article?: {
    id: string;
    title: string;
    content: string;
    language: string;
    createdAt: string;
    imageUrl?: string;
    podcastUrl?: string;
    seo?: {
      score: number;
      keywords: string[];
    };
  };
  message?: string;
  sessionId?: string;
}
