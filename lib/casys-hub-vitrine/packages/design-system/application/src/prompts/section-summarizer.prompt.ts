import type { PromptTemplatePort } from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

/**
 * DTO pour le prompt de résumé de section
 */
export interface SectionSummarizerPromptDTO {
  sectionTitle: string;
  sectionContent: string;
  sectionLevel: number;
  maxSentences: number;
}

function assertNonEmpty(value: unknown, name: string) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    throw new Error(`[section-summarizer.prompt] Paramètre requis manquant: ${name}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[section-summarizer.prompt] ${message}`);
}

/**
 * Construit un prompt POML pour résumer une section
 * - Validations strictes (fail-fast)
 * - Utilise pomljs directement
 * - Détecte les placeholders non résolus
 */
export async function buildSectionSummarizerPoml(
  promptTemplate: PromptTemplatePort,
  templatePath: string,
  dto: SectionSummarizerPromptDTO
): Promise<string> {
  assertNonEmpty(templatePath, 'templatePath');

  // Validations strictes (fail-fast)
  assert(typeof dto.sectionTitle === 'string' && dto.sectionTitle.trim().length > 0, 'sectionTitle requis');
  assert(typeof dto.sectionContent === 'string' && dto.sectionContent.trim().length > 0, 'sectionContent requis');
  assert(typeof dto.sectionLevel === 'number' && dto.sectionLevel > 0, 'sectionLevel requis (>0)');
  assert(typeof dto.maxSentences === 'number' && dto.maxSentences > 0, 'maxSentences requis (>0)');

  const raw = await promptTemplate.loadTemplate(templatePath);
  try {
    logger.debug('[section-summarizer] template', { templatePath: String(templatePath) });
  } catch {
    // Ignorer toute erreur de logging
  }

  // Construire le contexte pour l'injection de variables
  const context = {
    sectionTitle: dto.sectionTitle,
    sectionContent: dto.sectionContent,
    sectionLevel: dto.sectionLevel.toString(),
    maxSentences: dto.maxSentences.toString(),
  };

  // Utiliser pomljs pour parser et rendre avec le contexte
  try {
    const { read } = await import('pomljs');
    const rendered = await read(raw, undefined, context);
    
    // Détection de placeholders non résolus (ex: {{unknownVar}})
    if (/\{\{\s*[\w.]+\s*\}\}/.test(rendered)) {
      throw new Error('[section-summarizer.prompt] Placeholders non résolus dans le template');
    }
    
    return rendered;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[section-summarizer.prompt] Erreur lors du rendu POML: ${msg}`);
  }
}
