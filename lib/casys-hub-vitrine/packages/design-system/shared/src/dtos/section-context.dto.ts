export interface SectionContextNeighborDTO {
  id?: string;
  title: string;
  position: number;
  level?: number;
  summary?: string;
}

export interface SectionContextArticleDTO {
  title?: string;
  summary?: string;
  description?: string;
}

export interface SectionGraphContextDTO {
  article: SectionContextArticleDTO;
  current: { id: string; title: string; position: number };
  ancestors: SectionContextNeighborDTO[];
  siblings: SectionContextNeighborDTO[];
  previous?: SectionContextNeighborDTO | null;
  nextPlanned?: { title?: string; description?: string } | null;
}
