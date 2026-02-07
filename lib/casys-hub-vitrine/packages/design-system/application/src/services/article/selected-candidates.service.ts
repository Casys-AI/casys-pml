import type { Topic, TopicCandidate } from '@casys/core';

export class SelectedCandidatesService {
  /**
   * Mappe les topics sélectionnés vers les candidats d'origine (id/sourceUrl)
   * - Fail-fast si candidat introuvable
   * - Fail-fast si sourceUrl manquant
   * - Unifie l'ID du topic avec l'ID persistant du candidat
   */
  static mapSelectedToCandidates(topics: Topic[], candidates: TopicCandidate[]): TopicCandidate[] {
    if (!Array.isArray(topics) || topics.length === 0) return [];

    return topics.map(t => {
      const found = candidates.find(
        c => c.id === t.id || (!!t.sourceUrl && c.sourceUrl === t.sourceUrl)
      );
      if (!found) {
        throw new Error(
          "[GenerateArticleLinearUseCase] Topic sélectionné introuvable parmi les candidats d'origine"
        );
      }
      if (!found.sourceUrl || found.sourceUrl.trim().length === 0) {
        throw new Error(
          '[GenerateArticleLinearUseCase] Candidate sans sourceUrl: fetch impossible'
        );
      }
      // Unifier l'ID en mémoire avec l'ID persistant (candidate.id)
      t.id = found.id;
      if (!t.sourceUrl && found.sourceUrl) t.sourceUrl = found.sourceUrl;
      return found;
    });
  }
}
