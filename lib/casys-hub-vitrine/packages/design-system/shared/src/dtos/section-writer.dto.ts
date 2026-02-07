// DTOs pour le Section Writer (prompt POML)
// Exposés via @casys/shared

import type { ProjectContextDTO } from './seo-analysis.dto';

export interface SectionWriterPromptDTO {
  // Contexte global
  language: string; // ex: 'fr', 'en'
  // Sujet/section à écrire
  topicTitle: string; // Titre de la section (obligatoire)
  sectionDescription?: string; // Description de cette section (de l'outline)
  // Contexte riche (markdown) issu du GraphContextBuilder
  context: string; // markdown
  // Optionnels
  angle?: string; // si disponible via outline
  targetCharsPerSection?: number; // Target chars for this section (300-3000) from editorial brief
  // Contexte business pour contextualiser le ton et la cible
  businessContext?: ProjectContextDTO;

  // ✨ Graph RAG : Liens contextuels pour CETTE section uniquement
  relatedArticles?: {
    id: string;
    title: string;
    excerpt: string;
    url?: string;
    relevanceScore?: number;
    reason?: string;
  }[];
  suggestedTopics?: {
    id: string;
    title: string;
    excerpt: string;
    url: string;
    relevanceScore?: number;
    reason?: string;
  }[];
}
