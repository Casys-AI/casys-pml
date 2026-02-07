import type { SeoBriefData, SeoBriefDataV3, Topic, TopicCandidate, ChosenCluster } from '@casys/core';

/**
 * State du workflow LangGraph TopicSelector (REFACTORÉ v3)
 *
 * ⚠️ CHANGEMENT ARCHITECTURAL V3 :
 * L'angle et le cluster sont maintenant FOURNIS en INPUT (depuis SelectTopicCommand).
 * TopicSelector se concentre uniquement sur la sélection de topics pertinents pour cet angle.
 */
export interface TopicSelectorState {
  // Input (immutables) - FOURNIS via SelectTopicCommand (V3)
  angle: string; // ✨ Angle éditorial déjà sélectionné (GenerateAngleUseCase)
  chosenCluster: ChosenCluster; // ✨ Cluster sémantique déjà choisi (pillar + satellites)
  
  // ✨ V3: Métadonnées de sélection depuis GenerateAngleUseCase
  contentType: ContentType;
  selectionMode: ClusterSelectionMode;
  tags: KeywordTag[]; // Tags depuis KeywordPlan
  targetPersona?: PersonaProfile;

  // Input (context)
  articles: TopicCandidate[];
  seoBriefData?: SeoBriefData | SeoBriefDataV3; // ✨ V3: Accepte les deux formats
  projectId: string;
  tenantId: string;
  language: string;
  maxTopics: number;
  templatePath: string;

  // Generated (mutables)
  topics?: Topic[]; // Topics filtrés et scorés pour cet angle/cluster

  // Control flow (simplifié)
  status: 'pending' | 'filtering' | 'completed' | 'failed';
  failureReason?: string;
}

/**
 * Résultat final du workflow (SIMPLIFIÉ v2)
 *
 * Plus besoin de retourner angle/cluster/seoSummary car déjà fournis en input.
 */
export interface TopicSelectorWorkflowResult {
  topics: Topic[]; // Topics sélectionnés pour l'angle/cluster
  status: 'success' | 'failed';
  failureReason?: string;
}
