import type { Topic, TopicCandidate } from '../entities/topic.entity';
import type { KeywordTag, SeoBriefData, SeoBriefDataV3 } from './seo.types';
import type { ChosenCluster, ContentType, ClusterSelectionMode, PersonaProfile } from './angle-selection.types';

/**
 * Commande applicative (domain-centric) pour la sélection de sujets.
 * Utilise exclusivement des types/VO de domaine.
 *
 * ⚠️ V3 ARCHITECTURE: L'angle éditorial doit être fourni (généré par GenerateAngleUseCase en amont)
 * SelectTopicUseCase filtre les topics EN FONCTION de l'angle, il ne le génère plus.
 */
export interface SelectTopicCommand {
  tenantId: string;
  projectId: string;
  language: string;

  // Articles candidats à évaluer (découverte actualités)
  articles: TopicCandidate[];

  // Tags issus du KeywordPlan (source de vérité), à "élaguer"
  tags: KeywordTag[];

  // Analyse SEO complète générée par SeoAnalysisAgent
  // V3: Accepte SeoBriefDataV3 (objets métier) ou SeoBriefData (v2 flat pour backward compatibility)
  seoBriefData?: SeoBriefDataV3 | SeoBriefData;

  // ✨ V3: Angle éditorial fourni par GenerateAngleUseCase (REQUIS)
  angle: string;

  // ✨ V3: Métadonnées de sélection d'angle (REQUISES pour TopicSelectorWorkflow)
  chosenCluster: ChosenCluster;
  contentType: ContentType;
  selectionMode: ClusterSelectionMode;
  targetPersona?: PersonaProfile;
}

/**
 * Résultat applicatif (domain-centric) de la sélection de sujets.
 * Utilise exclusivement des types/VO de domaine.
 *
 * V3: seoSummary supprimé - EditorialBriefAgent synthétise maintenant
 * les données SEO (questions PAA, content gaps, recommandations) de façon optimale.
 */
export interface SelectTopicResult {
  topics: Topic[];      // sujets retenus
  angle: string;        // angle éditorial (une phrase)

  // ✨ Cluster choisi par l'IA (pour lien EditorialBrief -> KeywordTags)
  chosenCluster?: {
    pillarTag?: KeywordTag;
    satelliteTags: KeywordTag[];
  };
  contentType?: 'guide' | 'comparatif' | 'liste' | 'tutoriel' | 'étude-de-cas' | 'interview' | 'analyse-tendance';
  targetPersona?: {
    category: string;
    archetype: string;
    profile: {
      techSavviness: string;
    };
  };
  selectionMode?: 'pillar' | 'satellite';
}
