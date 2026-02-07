export const ApplicationEventTypes = {
  OutlineIndexed: 'outline_indexed',
  SectionStarted: 'section_started',
  SectionIndexed: 'section_indexed',
  SectionCompleted: 'section_completed',
  ArticlePublished: 'article_published',
  SeoPostEvalTodo: 'seo_post_eval_todo',
} as const;

export type ApplicationEventType = typeof ApplicationEventTypes[keyof typeof ApplicationEventTypes];

export interface OutlineIndexedPayload {
  articleId: string;
  sectionsCount: number;
}

export interface SectionStartedPayload {
  articleId: string;
  sectionId: string;
  position: number;
  title: string;
  index: number;
}

export interface SectionIndexedPayload {
  articleId: string;
  sectionId: string; // ID simple (compat ascendante)
  sectionUid: string; // ID canonique ${articleId}::${position}
  position: number;
}

export interface SectionCompletedPayload {
  articleId: string;
  sectionId: string;
  position: number;
  index: number;
}

export interface ArticlePublishedPayload {
  results: { target: string; url?: string; path?: string; success: boolean }[];
}

export interface SeoPostEvalTodoPayload {
  language: string;
  wordCount: number;
}

export type ApplicationEventDTO =
  | { type: typeof ApplicationEventTypes.OutlineIndexed; payload: OutlineIndexedPayload }
  | { type: typeof ApplicationEventTypes.SectionStarted; payload: SectionStartedPayload }
  | { type: typeof ApplicationEventTypes.SectionIndexed; payload: SectionIndexedPayload }
  | { type: typeof ApplicationEventTypes.SectionCompleted; payload: SectionCompletedPayload }
  | { type: typeof ApplicationEventTypes.ArticlePublished; payload: ArticlePublishedPayload }
  | { type: typeof ApplicationEventTypes.SeoPostEvalTodo; payload: SeoPostEvalTodoPayload };

export type ApplicationEventHandler = (event: ApplicationEventDTO) => void | Promise<void>;
