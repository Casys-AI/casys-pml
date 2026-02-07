import type { LoggerPort } from '@casys/shared';

// ✨ Type alias local pour compatibilité
type Logger = LoggerPort;
import type {
  CandidateAngle,
  ChosenCluster,
  ClusterSelectionMode,
  ContentType,
  EditorialBrief,
  PersonaProfile,
  SeoBriefDataV3,
  TopicCandidate,
} from '@casys/core';
import type {
  AITextModelPort,
  EditorialBriefStorePort,
  PromptTemplatePort,
} from '@casys/application';

/**
 * State du workflow LangGraph AngleSelection
 * Gère la génération itérative d'angles avec validation anti-doublons
 */
export interface AngleSelectionState {
  // Input (immutables)
  tenantId: string;
  projectId: string;
  language: string;
  articles: TopicCandidate[];
  seoBriefData: SeoBriefDataV3;
  businessContext: {
    industry: string;
    siteType?: string;
    targetAudience: string;
    businessDescription?: string;
    contentType?: string;
    personas?: PersonaProfile[];
  };
  existingBriefs: EditorialBrief[]; // ✨ V3.1: Briefs complets (le mapper extrait id/angle/createdAt)
  templatePath: string;

  // Generated (mutables)
  candidateAngles?: CandidateAngle[]; // 3-5 angles générés
  validatedAngles?: CandidateAngle[]; // Angles acceptés par LLM Judge
  selectedAngle?: string; // Premier angle valide sélectionné
  chosenCluster?: ChosenCluster;
  contentType?: ContentType;
  targetPersona?: PersonaProfile;
  selectionMode?: ClusterSelectionMode;

  // Validation state
  rejectedAngles?: {
    angle: string;
    reason: string;
    conflictingBriefId?: string;
  }[];

  // Control flow
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'generating' | 'validating' | 'selecting' | 'completed' | 'failed';
  failureReason?: string;
}

/**
 * Dépendances injectées dans les nodes du workflow
 */
export interface AngleSelectionNodeDeps {
  aiModel: AITextModelPort;
  briefStore: EditorialBriefStorePort;
  templateReader: PromptTemplatePort;
  logger: Logger;
}

/**
 * Résultat final du workflow AngleSelection
 * Keeping only internal state and node outputs here.
 */

/**
 * Résultat du node generateAngles (parsing LLM)
 */
export interface GenerateAnglesNodeResult {
  candidateAngles: CandidateAngle[];
}

/**
 * Résultat du node validateAngles (LLM Judge)
 */
export interface ValidateAnglesNodeResult {
  validatedAngles: CandidateAngle[];
  rejectedAngles: {
    angle: string;
    reason: string;
    conflictingBriefId?: string;
  }[];
}
