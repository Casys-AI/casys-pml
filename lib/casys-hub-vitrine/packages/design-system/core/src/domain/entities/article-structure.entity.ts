import { type ComponentUsage } from './component.entity';
import type { Topic } from './topic.entity';

/**
 * Représente la structure hiérarchique d'un article avec ses sections et composants
 */

export interface ArticleNode {
  id: string;
  title: string;
  /** Slug SEO-friendly pour URLs (généré automatiquement si non fourni) */
  slug?: string;
  description: string;
  language: string;
  createdAt: string;
  keywords: string[];
  /** Image de couverture de l'article (optionnelle) */
  cover?: { src: string; alt?: string };
  sources: string[];
  agents: string[];
  tenantId: string;
  projectId: string;
  content?: string; // Contenu complet de l'article (optionnel)
}

export interface SectionNode {
  id: string;
  title: string;
  description?: string;
  level: number; // 1 pour h1, 2 pour h2, 3 pour h3
  content: string;
  summary?: string; // Résumé IA intelligent de la section (généré après écriture)
  position: number; // Position dans l'article
  articleId: string;
  parentSectionId?: string; // ID de la section parente (si niveau > 1)
  // V3.1: Contrainte de longueur cible pour génération de contenu (caractères)
  targetCharsPerSection?: number;
  // ✨ Graph RAG : Liens contextuels par section
  relatedArticles?: {
    id: string;
    title: string;
    excerpt: string;
    url?: string;
    relevanceScore?: number;
    reason?: string; // Pourquoi ce lien ici (généré par IA)
  }[];
  suggestedTopics?: {
    id: string;
    title: string;
    excerpt: string;
    url: string;
    relevanceScore?: number;
    reason?: string; // Pourquoi cette source ici (généré par IA)
  }[];
}

/**
 * Représente un fragment de texte dans une section qui peut être commenté
 */
export interface TextFragment {
  id: string;
  content: string; // Le texte du fragment
  sectionId: string; // Section parente
  position: number; // Position dans la section
  startOffset?: number; // Position caractère début (optionnel)
  endOffset?: number; // Position caractère fin (optionnel)
}

export interface ArticleStructure {
  article: ArticleNode;
  sections: SectionNode[];
  /** Liste des sujets/thèmes qui ont servi à composer l'article (multi-topics) */
  topics?: Topic[];
  componentUsages: ComponentUsage[];
  textFragments: TextFragment[]; // Fragments de texte commentables
  comments?: ArticleComment[];
}

export interface ArticleComment {
  id: string;
  articleId: string;
  textFragmentId: string; // Lie au fragment de texte spécifique
  content: string;
  position: number; // Position dans la section
  authorId?: string;
  createdAt: string;
  replies?: ArticleComment[];
  metadata?: Record<string, unknown>;
}

export interface ArticleSearchResult {
  articleId: string;
  articleTitle: string;
  articleSlug?: string; // Slug de l'article (pour maillage interne)
  articleTags?: string[]; // Tags de l'article (via relation ARTICLE_HAS_TAG)
  sectionId?: string;
  sectionTitle?: string;
  sectionLevel?: number;
  sectionSummary?: string; // Résumé court de la section (différent de description)
  sectionDescription?: string;
  sectionPosition?: number;
  /** Position relative à la section courante (négatif=avant, positif=après) */
  relativePosition?: number;
  relevanceScore: number;
  componentIds?: string[]; // Composants utilisés dans cette section

  // ComponentUsage - Informations d'usage des composants
  usagePosition?: number; // Position du composant dans la section
  isSectionHeader?: boolean; // Le composant est-il utilisé comme header de section

  // Graph RAG - Enrichissement contextuel

  // 🎯 Articles enrichis (découverte thématique)
  topRelevantSections?: {
    sectionId: string;
    sectionTitle: string;
    relevanceScore: number;
  }[];
  contextualSectionsCount?: number;

  // 📋 Sections enrichies (exploration hiérarchique)
  parentContextScore?: number;
  childrenContextScore?: number;
  fragmentsContextScore?: number;
  commentsContextScore?: number;

  topFragments?: {
    fragmentId: string;
    content: string;
    relevanceScore: number;
    commentsCount: number;
  }[];

  // 🔍 Fragments spécifiques (recherche précise)
  fragmentId?: string;
  fragmentContent?: string;

  // 💬 Commentaires spécifiques (discussions contextualisées)
  commentId?: string;
  commentContent?: string;
}

/** Résultat de base pour les opérations sur les articles */
export interface ArticleOperationResult {
  success: boolean;
  message: string;
}

/** Résultat d'opération avec identifiants */
export interface ArticleOperationWithIds extends ArticleOperationResult {
  tenantId?: string;
  projectId?: string;
  articleId?: string;
}

/** Types utilitaires pour les résultats d'indexation d'articles */
export interface ArticleIndexingResult<T extends 'global' | 'tenant' | 'project' | 'article'> {
  success: boolean;
  indexedCount: number;
  failedCount: number;
  errors: Error[];
  indexedArticleIds: string[];
  message: string;
  scope: T;
}

export type ArticleIndexingGlobal = ArticleIndexingResult<'global'>;

export interface ArticleIndexingTenant extends ArticleIndexingResult<'tenant'> {
  tenantId: string;
}

export interface ArticleIndexingProject extends ArticleIndexingResult<'project'> {
  tenantId: string;
  projectId: string;
}

export interface ArticleIndexingArticle extends ArticleIndexingResult<'article'> {
  tenantId: string;
  projectId: string;
  articleId: string;

  // Métadonnées essentielles de l'article
  title: string;
  description: string;
  language: string;
  createdAt?: string;
}
