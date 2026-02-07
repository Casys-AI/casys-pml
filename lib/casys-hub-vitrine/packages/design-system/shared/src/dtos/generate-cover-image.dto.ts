// DTOs pour la génération d'image de couverture (partagés API / application)
import type { ImageFormat } from './project-config.dto';

// Commande d'application (intention métier)
export interface GenerateCoverImageCommandDTO {
  articleId: string;
  outlineTitle: string;
  outlineSummary: string;
  tags: string[]; // Tags générés par l'Outline Agent
  tenantId: string;
  projectId: string;
}

// Résultat d'application (sortie du use case)
export interface GeneratedCoverImageDTO {
  base64: string; // image encodée
  mime: string; // dérivé du format de config (ex: image/webp)
  alt: string; // Texte alternatif validé (<= 140 chars)
  format: ImageFormat;
  slug: string; // slug d'image utilisé dans le prompt
  // Note: aucune URL n'est retournée ici. L'upload et le calcul d'URL sont délégués aux publishers.
}

// Paramètres de construction de prompt (agnostiques du format infra)
export interface CoverPromptDTO {
  topic: string;
  slug: string;
  tags: string[];
  summary: string;
  format: ImageFormat;
  stylePrompt?: string;
  width: number;
  height: number;
}
