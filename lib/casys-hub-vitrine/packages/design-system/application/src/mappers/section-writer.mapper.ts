import type { SectionWriterPromptDTO } from '@casys/shared';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[section-writer.mapper] ${message}`);
}

function assertNonEmpty(value: unknown, name: string): asserts value is string {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    throw new Error(`[section-writer.mapper] ${name} requis et non vide`);
  }
}

/**
 * Interface représentant les données de state nécessaires pour le section writer
 * (correspond à un sous-ensemble d'ArticleGenerationState)
 */
export interface SectionWriterStateInput {
  language: string;
  outlineCommand?: {
    angle?: string;
  };
}

/**
 * Interface représentant les données de section nécessaires
 * Doit matcher exactement les types attendus par SectionWriterPromptDTO
 */
export interface SectionWriterSectionInput {
  title: string;
  description?: string;
  targetCharsPerSection?: number; // Per-section target from outline writer
  relatedArticles?: Array<{
    id: string;
    title: string;
    excerpt: string; // Requis dans le DTO
    url?: string;
    relevanceScore?: number;
    reason?: string;
  }>;
  suggestedTopics?: Array<{
    id: string; // Pas topicId
    title: string;
    excerpt: string; // Requis dans le DTO
    url: string; // Requis dans le DTO
    relevanceScore?: number;
    reason?: string;
  }>;
}

/**
 * Mappe les données de state et section vers le DTO du prompt section writer.
 *
 * Ce mapper garantit que:
 * 1. Toutes les valeurs requises sont présentes (fail-fast)
 * 2. Les valeurs proviennent bien du state/section (pas de valeurs hardcodées)
 * 3. La transformation est testable indépendamment
 *
 * @param state - État du workflow contenant language et outline
 * @param section - Données de la section à écrire
 * @param context - Contexte formaté pour la section (généré en amont par le node)
 * @returns DTO validé pour le prompt POML
 *
 * @throws Error si language ou section.title sont manquants/vides
 *
 * @example
 * ```typescript
 * const dto = mapStateToSectionWriterPromptDTO(
 *   { language: 'fr', outlineCommand: { angle: 'Guide pratique' } },
 *   { title: 'Introduction', description: 'Overview' },
 *   'Formatted context string'
 * );
 * ```
 */
export function mapStateToSectionWriterPromptDTO(
  state: SectionWriterStateInput,
  section: SectionWriterSectionInput,
  context: string
): SectionWriterPromptDTO {
  // Validations fail-fast strictes
  assert(state && typeof state === 'object', 'state requis (objet)');
  assert(section && typeof section === 'object', 'section requis (objet)');
  assert(typeof context === 'string', 'context requis (string, peut être vide)');

  // Language: requis et non vide
  assertNonEmpty(state.language, 'state.language');

  // Section title: requis et non vide (c'est le topicTitle dans le DTO)
  assertNonEmpty(section.title, 'section.title');

  // Construction du DTO avec les vraies valeurs du state/section
  const dto: SectionWriterPromptDTO = {
    topicTitle: section.title,
    context,
    language: state.language,
    sectionDescription: section.description,
    angle: state.outlineCommand?.angle,
    targetCharsPerSection: section.targetCharsPerSection, // Per-section target from outline writer
    relatedArticles: section.relatedArticles,
    suggestedTopics: section.suggestedTopics,
  };

  return dto;
}
