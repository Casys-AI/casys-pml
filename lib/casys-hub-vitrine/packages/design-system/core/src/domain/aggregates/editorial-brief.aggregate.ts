import { EditorialAngle } from '../value-objects/editorial-angle.value';
import type { KeywordTag, BlogRecommendations } from '../types/seo.types';
import type { ContentGap } from '../value-objects/content-gap.value';
import type { BusinessContext } from '../types/angle-selection.types';

export interface EditorialBriefCreateProps {
  id?: string;
  tenantId: string;
  projectId: string;
  language: string;
  angle: string; // Angle éditorial unique sélectionné

  // V3: Données enrichies par EditorialBriefAgent (optionnels pour reverse engineering)
  keywordTags?: KeywordTag[];
  relevantQuestions?: string[];
  priorityGaps?: ContentGap[];
  guidingRecommendations?: BlogRecommendations;
  corpusSummary?: string;
  competitorAngles?: string[];

  // V3.1: Contraintes structurelles (optionnels)
  targetSectionsCount?: number;
  targetCharsPerSection?: number;

  // V3: BusinessContext complet (targetAudience, industry, businessDescription, contentType, siteType, personas)
  businessContext: BusinessContext;
  corpusTopicIds: string[]; // Topics qui ont servi
  createdAt?: string; // ISO 8601
}

export class EditorialBrief {
  private constructor(
    private readonly _id: string,
    private readonly _tenantId: string,
    private readonly _projectId: string,
    private readonly _language: string,
    private readonly _angle: EditorialAngle,
    // V3: Champs enrichis (optionnels)
    private readonly _keywordTags: KeywordTag[] | undefined,
    private readonly _relevantQuestions: string[] | undefined,
    private readonly _priorityGaps: ContentGap[] | undefined,
    private readonly _guidingRecommendations: BlogRecommendations | undefined,
    private readonly _corpusSummary: string | undefined,
    private readonly _competitorAngles: string[] | undefined,
    // V3.1: Contraintes structurelles (optionnels)
    private readonly _targetSectionsCount: number | undefined,
    private readonly _targetCharsPerSection: number | undefined,
    // V3: BusinessContext complet avec siteType et personas
    private readonly _businessContext: BusinessContext,
    private readonly _corpusTopicIds: string[],
    private readonly _createdAt: string
  ) {}

  static create(props: EditorialBriefCreateProps): EditorialBrief {
    const id = (props.id ?? `brief_${Math.random().toString(36).slice(2, 10)}`).trim();
    const tenantId = (props.tenantId ?? '').trim();
    const projectId = (props.projectId ?? '').trim();
    const language = (props.language ?? '').trim();

    if (!tenantId) throw new Error('EditorialBrief: tenantId is required');
    if (!projectId) throw new Error('EditorialBrief: projectId is required');
    if (!language) throw new Error('EditorialBrief: language is required');

    const angle =
      typeof props.angle === 'string' ? EditorialAngle.create(props.angle) : props.angle;
    const businessContext = props.businessContext;

    // Validation BusinessContext
    if (!businessContext.targetAudience?.trim())
      throw new Error('EditorialBrief: businessContext.targetAudience is required');
    if (!businessContext.industry?.trim())
      throw new Error('EditorialBrief: businessContext.industry is required');
    if (!businessContext.businessDescription?.trim())
      throw new Error('EditorialBrief: businessContext.businessDescription is required');

    const corpus = Array.from(
      new Set((props.corpusTopicIds ?? []).map(x => String(x).trim()).filter(Boolean))
    );
    // Assoupli: autoriser un corpus vide (cas: aucun lien externe détecté)

    // V3.1: Validation contraintes structurelles
    if (props.targetSectionsCount !== undefined) {
      const count = props.targetSectionsCount;
      if (!Number.isInteger(count) || count < 1 || count > 15) {
        throw new Error(
          'EditorialBrief: targetSectionsCount must be an integer between 1 and 15'
        );
      }
    }

    if (props.targetCharsPerSection !== undefined) {
      const chars = props.targetCharsPerSection;
      if (!Number.isInteger(chars) || chars < 300 || chars > 3000) {
        throw new Error(
          'EditorialBrief: targetCharsPerSection must be an integer between 300 and 3000'
        );
      }
    }

    // V3.1: Validation cohérence (warning si total trop grand)
    if (props.targetSectionsCount && props.targetCharsPerSection) {
      const totalChars = props.targetSectionsCount * props.targetCharsPerSection;
      if (totalChars > 30000) {
        console.warn(
          `[EditorialBrief] Total article length (${totalChars} chars) exceeds recommended 30k. ` +
          `Consider reducing sections or chars/section.`
        );
      }
    }

    const createdAt = props.createdAt ?? new Date().toISOString();

    return new EditorialBrief(
      id,
      tenantId,
      projectId,
      language,
      angle,
      // V3: Champs enrichis (optionnels)
      props.keywordTags,
      props.relevantQuestions,
      props.priorityGaps,
      props.guidingRecommendations,
      props.corpusSummary,
      props.competitorAngles,
      // V3.1: Contraintes structurelles (optionnels)
      props.targetSectionsCount,
      props.targetCharsPerSection,
      businessContext,
      corpus,
      createdAt
    );
  }

  get id(): string {
    return this._id;
  }
  get tenantId(): string {
    return this._tenantId;
  }
  get projectId(): string {
    return this._projectId;
  }
  get language(): string {
    return this._language;
  }
  get angle(): EditorialAngle {
    return this._angle;
  }
  // V3 getters
  get keywordTags(): KeywordTag[] | undefined {
    return this._keywordTags;
  }
  get relevantQuestions(): string[] | undefined {
    return this._relevantQuestions;
  }
  get priorityGaps(): ContentGap[] | undefined {
    return this._priorityGaps;
  }
  get guidingRecommendations(): BlogRecommendations | undefined {
    return this._guidingRecommendations;
  }
  get corpusSummary(): string | undefined {
    return this._corpusSummary;
  }
  get competitorAngles(): string[] | undefined {
    return this._competitorAngles;
  }
  // V3.1 getters
  get targetSectionsCount(): number | undefined {
    return this._targetSectionsCount;
  }
  get targetCharsPerSection(): number | undefined {
    return this._targetCharsPerSection;
  }
  get businessContext() {
    return this._businessContext;
  }
  get corpusTopicIds(): string[] {
    return [...this._corpusTopicIds];
  }
  get createdAt(): string {
    return this._createdAt;
  }

  toObject() {
    return {
      id: this._id,
      tenantId: this._tenantId,
      projectId: this._projectId,
      language: this._language,
      angle: this._angle.value,
      // V3: Champs enrichis directs (optionnels)
      keywordTags: this._keywordTags,
      relevantQuestions: this._relevantQuestions,
      priorityGaps: this._priorityGaps,
      guidingRecommendations: this._guidingRecommendations,
      corpusSummary: this._corpusSummary,
      competitorAngles: this._competitorAngles,
      // V3.1: Contraintes structurelles (optionnels)
      targetSectionsCount: this._targetSectionsCount,
      targetCharsPerSection: this._targetCharsPerSection,
      businessContext: this._businessContext,
      corpusTopicIds: [...this._corpusTopicIds],
      createdAt: this._createdAt,
    };
  }
}
