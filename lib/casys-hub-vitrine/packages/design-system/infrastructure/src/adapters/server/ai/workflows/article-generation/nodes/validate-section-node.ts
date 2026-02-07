import type { AITextModelPort } from '@casys/application';

import { createLogger, type Logger } from '../../../../../../utils/logger';
import type { ArticleGenerationState } from '../article-generation.state';

export interface ValidateSectionNodeDeps {
  logger?: Logger;
  aiModel: AITextModelPort;
  minWords?: number;
}

export async function validateSectionNode(
  state: ArticleGenerationState,
  deps: ValidateSectionNodeDeps
): Promise<ArticleGenerationState> {
  const logger = deps.logger ?? createLogger('ArticleGeneration.validateSection');
  const minWords = deps.minWords ?? 100;

  const idx = state.cursorIndex ?? 0;
  const sec = state.sections.find(s => s.position === idx) ?? state.sections[idx];
  if (!sec) return state;

  const payload = {
    section: { id: sec.id, title: sec.title, position: sec.position, content: sec.content },
    language: state.language,
    rules: {
      minWords,
      transitions: sec.position > 0,
      noRedundancy: true,
    },
  };
  const prompt = `<poml>
<role>Relecteur éditorial</role>
<task>Validation d'une section (lisibilité & engagement)</task>
<p syntax="json">${JSON.stringify(payload)}</p>
<p>Check-list (signaler UNIQUEMENT les manquements majeurs, pas de micro-améliorations):
- Titre clair et concret
- 1 phrase d'accroche au début qui explique l'intérêt concret
- Paragraphes courts (≤ 4 lignes), pas de pavés
- Utiliser des listes à puces pour les énumérations
- Transitions simples si section non initiale
- Exemple concret si pertinent
- Utilise les possibilités du markdown
- Langage simple, voix active, sans jargon inutile
- Mot-clé principal présent naturellement (titre ou 100 premiers mots)</p>
<p>Si tout est acceptable: renvoyer {"issues":[]}.
Si de petites améliorations sont possibles mais non bloquantes: ne rien remonter.</p>
<output-format>{"issues":["string"]}</output-format>
</poml>`;

  try {
    const raw = await deps.aiModel.generateText(prompt);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { issues: [] } as unknown;
    }
    const issues = (parsed as { issues?: string[] }).issues ?? [];
    if (issues.length > 0) {
      const merged = [...(state.issues ?? []), { sectionId: sec.id, messages: issues }];
      return { ...state, issues: merged };
    }
    return state;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn?.('[ArticleGeneration] validateSection agent failed (non-bloquant)', {
      sectionId: sec.id,
      error: msg,
    });
    return state;
  }
}
