import type { SectionNode } from '../../entities/article-structure.entity';

export interface WriteSectionsOutlineSection {
  title: string;
  level: number;
  description?: string;
}

export interface WriteSectionsOutline {
  title?: string;
  summary?: string;
  sections: WriteSectionsOutlineSection[];
}

export interface WriteSectionsCommand {
  tenantId: string;
  projectId: string;
  articleId: string;
  language: string;
  angle?: string;
  outline: WriteSectionsOutline;
  sources?: string[];
}

export interface WriteSectionsPort {
  execute(command: WriteSectionsCommand): Promise<SectionNode[]>;
}
