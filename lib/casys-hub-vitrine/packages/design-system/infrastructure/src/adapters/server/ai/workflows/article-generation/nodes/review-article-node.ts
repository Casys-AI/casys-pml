import type { AITextModelPort } from '@casys/application';
import { createLogger, type Logger } from '../../../../../../utils/logger';
import type { ArticleGenerationState } from '../article-generation.state';
import {
  reviewOutputSchema,
  validateFragmentCommentLinks,
  validateFragmentSectionRefs,
  type ReviewOutput,
} from '@casys/application';

export interface ReviewArticleNodeDeps {
  logger?: Logger;
  aiModel: AITextModelPort;
}

/**
 * Review Article Node with Smart Validation + Fuzzy Context TextFragments
 *
 * Smart Validation Strategy:
 * - Attempt 1: Review all sections (initial quality check)
 * - Attempt 2+: Only review sections in `state.recentlyModifiedIds`
 *   → 71% token reduction on attempt 2+
 *
 * Output Format:
 * - TextFragments: Precise patches with contextBefore/target/contextAfter
 * - ArticleComments: Rationale for each modification (why)
 */
export async function reviewArticleNode(
  state: ArticleGenerationState,
  deps: ReviewArticleNodeDeps
): Promise<ArticleGenerationState> {
  const logger = deps.logger ?? createLogger('ArticleGeneration.reviewArticle');

  // ========================================
  // SMART VALIDATION: Filter sections to review
  // ========================================
  const shouldUseSmartValidation =
    state.recentlyModifiedIds && state.recentlyModifiedIds.length > 0;

  const sectionsToReview = shouldUseSmartValidation
    ? state.sections.filter(s => state.recentlyModifiedIds!.includes(s.id))
    : state.sections;

  if (shouldUseSmartValidation) {
    logger.log?.(
      `[reviewArticle] Smart validation: reviewing ${sectionsToReview.length}/${state.sections.length} modified sections`,
      { recentlyModifiedIds: state.recentlyModifiedIds }
    );
  } else {
    logger.log?.(
      `[reviewArticle] Initial review: validating all ${sectionsToReview.length} sections`
    );
  }

  // Early exit: no sections to review
  if (sectionsToReview.length === 0) {
    logger.log?.('[reviewArticle] No sections to review, skipping');
    return { ...state, reviews: [], textFragments: [], comments: [] };
  }

  // ========================================
  // Prepare payload for AI
  // ========================================
  const payload = {
    outline: state.outline,
    sections: sectionsToReview.map(s => ({
      id: s.id,
      title: s.title,
      position: s.position,
      content: s.content,
    })),
    language: state.language,
    attemptNumber: (state.attemptNumber ?? 1) + 1, // Next attempt number
    smartValidation: shouldUseSmartValidation,
  };

  // ========================================
  // AI Prompt with TextFragment format
  // ========================================
  const prompt = `<poml syntax="markdown">
<role>Rédacteur en chef expert</role>
<task>Relecture ${shouldUseSmartValidation ? 'ciblée' : 'globale'} avec corrections TextFragment</task>

<!-- Payload données article -->
<p syntax="json">${JSON.stringify(payload)}</p>

<!-- 📋 Contexte de révision -->
<p><strong>Mode:</strong> ${shouldUseSmartValidation ? `Smart validation - Tentative ${payload.attemptNumber}` : 'Révision globale - Première tentative'}</p>
<p><strong>Scope:</strong> ${shouldUseSmartValidation ? `${sectionsToReview.length} sections récemment modifiées UNIQUEMENT` : 'Toutes les sections + cohérence d\'ensemble'}</p>

<!-- 🎯 Objectifs de révision -->
<p><strong>🎯 Points de focus:</strong></p>
<list>
  <item>**Fil conducteur** : progression logique${!shouldUseSmartValidation ? ' entre sections' : ''}</item>
  <item>**Doublons** : fusionner si redondant${!shouldUseSmartValidation ? ' entre sections' : ''}</item>
  <item>**Transitions** : ${!shouldUseSmartValidation ? 'phrases-pont inter-sections si manquantes' : 'fluides dans chaque section'}</item>
  <item>**Cohérence** : terminologie et ton constants</item>
  <item>**Liens internes** : références croisées vers autres sections</item>
  ${!shouldUseSmartValidation ? '<item>**Intro/Conclusion** : promesse alignée + synthèse + CTA</item>' : ''}
  ${!shouldUseSmartValidation ? '<item>**Volume** : équilibre entre sections (éviter disproportion)</item>' : ''}
  ${!shouldUseSmartValidation ? '<item>**SEO** : couverture sous-thèmes, H1 unique, H2/H3 équilibrés</item>' : ''}
  <item>**Lisibilité** : paragraphes courts, exemples concrets</item>
</list>

<!-- ⚠️ Contraintes strictes -->
<p><strong>⚠️ Contraintes strictes:</strong></p>
<list>
  <item>❌ **Interdiction absolue** : modifier les titres de sections (éditer contenu uniquement)</item>
  <item>⚠️ **Parcimonie** : maximum 1-2 corrections par section (prioriser impact)</item>
  <item>🎯 **Pragmatisme** : accepter "assez bien" - ne pas chercher la perfection</item>
  <item>✅ **Si acceptable** : renvoyer <code>{"textFragments":[],"comments":[]}</code></item>
  <item>📊 **Maximum total** : 6 corrections (les plus impactantes)</item>
</list>

<!-- 📋 Format de sortie - TextFragments -->
<p><strong>📋 Structure TextFragment (TOUS les champs OBLIGATOIRES):</strong></p>

<p><strong>TextFragment:</strong></p>
<list>
  <item><code>id</code> (string) : UUID unique (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)</item>
  <item><code>sectionId</code> (string) : ID de la section concernée</item>
  <item><code>content</code> (string) : nouveau texte de remplacement</item>
  <item><code>position</code> (number) : ⚠️ OBLIGATOIRE - position numérique (commence à 0)</item>
  <item><code>metadata</code> (object) : ⚠️ OBLIGATOIRE - contexte fuzzy avec 3 propriétés:
    <list>
      <item><code>contextBefore</code> (string[]) : EXACTEMENT 150 caractères AVANT target</item>
      <item><code>target</code> (string) : texte EXACT à remplacer (copie verbatim)</item>
      <item><code>contextAfter</code> (string[]) : EXACTEMENT 150 caractères APRÈS target</item>
    </list>
  </item>
</list>

<p><strong>ArticleComment:</strong> (lié à chaque TextFragment)</p>
<list>
  <item><code>id</code> (string) : UUID unique</item>
  <item><code>textFragmentId</code> (string) : UUID du TextFragment associé</item>
  <item><code>content</code> (string) : explication du POURQUOI (10+ caractères)</item>
  <item><code>position</code> (number) : position numérique</item>
  <item><code>authorId</code> (string) : toujours "AI-reviewer"</item>
</list>

<!-- ✅ Règles de validation contexte fuzzy -->
<p><strong>✅ Règles contexte fuzzy:</strong></p>
<list>
  <item>**Copie exacte** : contextBefore/target/contextAfter = verbatim du texte existant (pas de paraphrase)</item>
  <item>**Cas limites** : contextBefore=[] si début de section, contextAfter=[] si fin</item>
  <item>**150 caractères** : compter EXACTEMENT 150 chars (espaces inclus) avant et après target</item>
  <item>**Target isolé** : contextBefore et contextAfter NE DOIVENT PAS contenir le target</item>
  <item>**Corrections locales** : privilégier 1-2 phrases plutôt que gros blocs</item>
</list>

<!-- 📝 Exemple complet -->
<p><strong>📝 Exemple:</strong></p>
<code syntax="json">
{
  "textFragments": [
    {
      "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "sectionId": "section-2",
      "content": "Cette approche permet d'améliorer les performances de 40% tout en réduisant la complexité.",
      "position": 0,
      "metadata": {
        "contextBefore": ["## Optimisation des performances\n\nLes méthodes traditionnelles montrent leurs limites face aux volumes croissants. Pour répondre à ces défis, une nouvelle approche s'impose. "],
        "target": "Cette approche améliore les performances.",
        "contextAfter": [" Les tests montrent des résultats prometteurs sur plusieurs environnements de production avec des gains mesurables en latence et throughput."]
      }
    }
  ],
  "comments": [
    {
      "id": "f6e5d4c3-b2a1-4f0e-9d8c-7b6a5f4e3d2c",
      "textFragmentId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "content": "Ajout données chiffrées (40%) et bénéfice secondaire (réduction complexité) pour renforcer crédibilité.",
      "position": 0,
      "authorId": "AI-reviewer"
    }
  ]
}
</code>

<output-format>{"textFragments":[...],"comments":[...]}</output-format>
</poml>`;

  try {
    // ========================================
    // Call AI and parse response
    // ========================================
    const raw = await deps.aiModel.generateText(prompt);
    const parsed = JSON.parse(raw);

    // Defensive validation: log structure issues before Zod validation
    if (parsed.textFragments && Array.isArray(parsed.textFragments)) {
      for (const frag of parsed.textFragments) {
        if (typeof frag.position !== 'number') {
          logger.warn?.(
            '[reviewArticle] TextFragment missing or invalid position field',
            {
              fragmentId: frag.id,
              sectionId: frag.sectionId,
              positionType: typeof frag.position,
              positionValue: frag.position,
            }
          );
        }
        if (!frag.metadata || typeof frag.metadata !== 'object') {
          logger.warn?.(
            '[reviewArticle] TextFragment missing or invalid metadata field',
            {
              fragmentId: frag.id,
              sectionId: frag.sectionId,
              metadataType: typeof frag.metadata,
              hasMetadata: !!frag.metadata,
            }
          );
        }
      }
    }

    const validated = reviewOutputSchema.parse(parsed);

    // Validation checks
    const linkValidation = validateFragmentCommentLinks(
      validated.textFragments,
      validated.comments
    );
    if (!linkValidation.valid) {
      logger.warn?.('[reviewArticle] Fragment-comment link validation failed', linkValidation.errors);
    }

    const sectionValidation = validateFragmentSectionRefs(
      validated.textFragments,
      sectionsToReview.map(s => s.id)
    );
    if (!sectionValidation.valid) {
      logger.warn?.('[reviewArticle] Fragment section reference validation failed', sectionValidation.errors);
    }

    logger.log?.(
      `[reviewArticle] Generated ${validated.textFragments.length} fragments, ${validated.comments.length} comments`
    );

    return {
      ...state,
      textFragments: validated.textFragments as any[], // Cast to domain type
      comments: validated.comments as any[], // Cast to domain type
    };
  } catch (e) {
    try {
      logger.warn?.(
        '[reviewArticle] Review failed, continuing without corrections',
        (e as Error)?.message
      );
    } catch {}
    return {
      ...state,
      textFragments: [],
      comments: [],
    };
  }
}
