import type { SeoBriefDataV3, Topic } from '@casys/core';

export class SelectionValidator {
  static validate(topics: Topic[], seoSummary: SeoBriefDataV3, angle: string): void {
    if (!Array.isArray(topics)) {
      throw new Error('[SelectionValidator] topics doit être un array');
    }

    // ✅ ALLOW EMPTY ARRAY: Si aucun topic ne matche l'angle fourni, c'est valide
    // Le workflow amont décidera du prochain pas (retry, reangle, abandon)
    if (topics.length === 0) {
      // Just log/document but don't fail - the calling code handles empty selection
      return;
    }

    // Valider que chaque topic sélectionné est complet
    for (const t of topics) {
      if (!t.sourceUrl) throw new Error('[SelectionValidator] Selected topic has no sourceUrl');
      if (!t.createdAt) throw new Error('[SelectionValidator] Selected topic has no createdAt');
    }

    if (!angle || !String(angle).trim()) {
      throw new Error('[GenerateArticleLinearUseCase] angle éditorial requis (fail-fast)');
    }
  }
}
