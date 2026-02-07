/**
 * DTOs de configuration User/Project partagés
 * Placés dans @casys/shared pour être utilisés par CLI, API et Infrastructure.
 */

// ============================
// Utilisateur
// ============================
export interface UserConfig {
  name: string;
  email: string;
  apiUrl: string;
  defaultTenant: string;
  currentProject?: string;
}

/**
 * Configuration de l'analyse SEO (exposée au client).
 * Centralise tous les paramètres SEO qui étaient éparpillés entre generation et topicSelector.
 */
export interface SeoAnalysisConfig {
  /** Intérêts utilisateur de base (pas encore optimisés SEO) */
  keywords: string[];
  /** Description du projet pour contexte business SEO */
  businessDescription: string;
  /** Industrie/secteur d'activité (OBLIGATOIRE - fail-fast si manquant) */
  industry: string;
  /** Audience cible (OBLIGATOIRE - fail-fast si manquant) */
  targetAudience: string;
  /** Template POML pour l'analyse SEO (OBLIGATOIRE) */
  template: string;
  /** Type de contenu manipulé (ex: "article", "landing", "guide"). Optionnel, défaut côté mapper: "article". */
  contentType: string;
  /** Importance des tendances dans l'analyse (0..1) */
  trendPriority?: number;
  /** Catégories à exclure des recommandations */
  excludeCategories?: string[];
  /** Activation de l'analyse SEO */
  enabled?: boolean;
  /** Domaine propre à analyser (optionnel, pour audit SEO et analyse concurrentielle) */
  ownDomain?: string;
}

// ============================
// Sources de contenu
// ============================
export interface SourceConfig {
  rss?: {
    url: string;
    tags: string[];
    priority?: number;
  }[];

  apis?: {
    name: string;
    endpoint: string;
    params?: Record<string, unknown>;
    headers?: Record<string, string>;
  }[];

  /** Configuration Web Agent pour découverte intelligente de topics */
  webAgent?: {
    /** Nombre maximal de résultats à retourner (défaut: 20) */
    maxResults?: number;
    /** Score minimal de pertinence pour filtrer les résultats (0-1, défaut: 0.6) */
    minScore?: number;
  };
}

// ============================
// Publication (GitHub + réseaux sociaux)
// ============================
export type ImageFormat = 'webp' | 'png' | 'jpeg' | 'jpg';

export interface PublicationConfig {
  github?: {
    enabled: boolean;
    /**
     * Type de connexion GitHub pour la publication.
     * - 'direct' : commit direct sur la branche cible via l'API Contents (token requis)
     * - 'pr'     : création d'une branche feature + Pull Request (recommandé en CI via GITHUB_TOKEN)
     * Fail-fast: ce champ est requis si github.enabled=true (pas de valeur par défaut implicite).
     */
    connection: 'direct' | 'pr';
    repo: string; // ex: org/repo
    branch: string; // ex: main
    /**
     * Chemin cible relatif à la racine du repo (sans nom de branche)
     * ex: apps/astro-web/src/content/articles
     */
    content_path: string;
    /**
     * Chemin des assets (images) relatif à la racine du repo.
     * Aucun défaut n'est appliqué. Fail-fast côté publisher si absent lorsque des images doivent être publiées.
     * Exemple: apps/astro-web/public/images/covers
     */
    assets_path?: string;
    /**
     * Préfixe d'URL public à utiliser pour référencer les assets dans le frontmatter.
     * Doit être soit une route-absolute (ex: "/images/covers" ou "/wp-content/uploads/covers"),
     * soit une URL absolue (ex: "https://cdn.exemple.com/covers").
     * Aucun fallback implicite depuis assets_path. Fail-fast si requis et manquant.
     */
    assets_url_base?: string;
    /**
     * Options spécifiques au mode PR
     */
    pr?: {
      /** Préfixe du nom de branche feature (ex: "casys/content/") */
      branch_prefix: string;
      /** Préfixe optionnel pour le titre de la PR */
      title_prefix?: string;
      /** Ouvrir la PR en mode brouillon */
      draft?: boolean;
      /** Labels à appliquer sur la PR */
      labels?: string[];
    };
  };

  /**
   * Format de fichier de contenu principal pour la publication (global, toutes cibles).
   * Par défaut selon project.type:
   *  - astro  -> "mdx"
   *  - hugo   -> "md" ("mdx" interdit)
   *  - wordpress -> "md"
   * Peut être surchargé ici. Rétro-compat: publication.file_system.format reste supporté comme alias.
   */
  content_format?: 'mdx' | 'md';

  file_system?: {
    enabled: boolean; // flag d’activation de la publication locale
    content_path: string; // chemin local d’écriture (ex: apps/astro-web/src/content/articles)
    /**
     * Chemin local des assets (images) relatif au projet (CASYS_PROJECT_ROOT).
     * Aucun défaut n'est appliqué. Fail-fast côté publisher si absent lorsque des images doivent être publiées.
     * Exemple: apps/astro-web/public/images/covers
     */
    assets_path?: string;
    /**
     * Préfixe d'URL public à utiliser pour référencer les assets dans le frontmatter.
     * Doit être soit une route-absolute (ex: "/images/covers"), soit une URL absolue (CDN).
     * Aucun fallback implicite depuis assets_path. Fail-fast si requis et manquant.
     */
    assets_url_base?: string;
    /**
     * [LEGACY] Alias historique pour le format de contenu.
     * Utiliser de préférence publication.content_format (global, toutes cibles).
     */
    format?: 'mdx' | 'md' | 'json';
  };

  /**
   * Configuration des images générées par l'application (ex: cover d'article).
   * Aucun comportement implicite: fail-fast si generate=true et que la génération/format n'est pas supporté.
   */
  images?: {
    /** Activer la génération automatique d'images (cover) si absente dans l'article. */
    generate: boolean;
    /**
     * Configuration explicite de la cover.
     * Aucun fallback implicite depuis images.* vers images.cover.* n'est autorisé.
     * Si images.generate=true, alors images.cover.template et images.cover.format sont requis.
     */
    cover?: {
      /** Chemin relatif du template POML à partir de CASYS_BLUEPRINTS_ROOT (ex: "prompts/images/cover.poml"). */
      template: string;
      /**
       * Format cible requis. Supportés: 'webp', 'png', 'jpeg'/'jpg'.
       * Fail-fast côté application si non supporté.
       */
      format: ImageFormat;
      /** Style prompt libre, concaténé dans le POML (échappement XML appliqué). */
      stylePrompt?: string;
      /** Largeur en pixels (défaut: 1536). */
      width?: number;
      /** Hauteur en pixels (défaut: 1024). */
      height?: number;
    };
  };

  social_media?: {
    twitter?: {
      enabled: boolean;
      account: string;
      auto_post: boolean;
      api_key?: string;
      api_secret?: string;
    };

    linkedin?: {
      enabled: boolean;
      profile: string;
      auto_post: boolean;
      access_token?: string;
    };

    meta?: {
      enabled: boolean;
      page_id: string;
      auto_post: boolean;
      access_token?: string;
      app_secret?: string;
    };
  };

  // Base canonique pour la génération d'URLs (utilisée par les générateurs de frontmatter)
  // La cible est désormais dérivée de project.type (ex: "astro" ou "hugo").
  canonicalBaseUrl?: string;

  // Configuration frontmatter optionnelle par profil/thème
  // - profile: nom du profil (ex: "astrowind", "starlight", "papermod", "custom")
  // - fields: overrides additionnels spécifiques au profil
  // - template: chemin explicite vers un template (obligatoire si profile="custom")
  frontmatter?: {
    profile?: string;
    /**
     * Champs frontmatter additionnels/overrides spécifiques au profil.
     * Supporte les références vers des clés canoniques via la forme:
     *  { fieldName: { $ref: "<canonicalPath>" } }
     * où <canonicalPath> peut utiliser la dot-notation si besoin.
     *
     * Règles:
     *  - Priorité de fusion: defaults < mapping < fields
     *  - Résolution $ref récursive, fail-fast si la clé canonique est inconnue
     *  - Les valeurs simples restent possibles: { fieldName: "value" }
     *
     * Mirroring via $ref (recommandé):
     *  - Dupliquez/renommez en déclarant plusieurs clés cibles pointant vers la même clé canonique.
     *    Exemple:
     *      fields: {
     *        description: { $ref: "excerpt" },
     *        summary:     { $ref: "excerpt" },
     *        keywords:    { $ref: "tags" }
     *      }
     */
    fields?: Record<string, unknown>;
    template?: string;
  };
}

// ============================
// Génération
// ============================
export interface GenerationConfig {
  tone: 'professionnel' | 'casual' | 'technique' | 'commercial';
  length: string; // ex: "800-1200"
  templates?: string[];
  /**
   * Configuration de l'analyse SEO (remplace topicSelector, contient keywords utilisateur et businessDescription).
   */
  seoAnalysis?: SeoAnalysisConfig;
  /**
   * Configuration de l'Angle Selector (génère l'angle éditorial + cluster sémantique).
   * ⚠️ NOUVELLE ARCHITECTURE: L'angle est généré AVANT le TopicSelector.
   */
  angleSelector?: {
    /** Chemin relatif du template POML (ex: "prompts/angle-selection.poml"). */
    template?: string;
    /** Nombre min d'angles candidats à générer (défaut: 3) */
    minAngles?: number;
    /** Nombre max d'angles candidats à générer (défaut: 5) */
    maxAngles?: number;
  };
  /**
   * Configuration minimaliste du Topic Selector (ne lit plus la config, reçoit données SEO enrichies).
   * ⚠️ NOUVELLE ARCHITECTURE: Reçoit angle + cluster en INPUT, filtre les topics.
   */
  topicSelector?: {
    /** Chemin relatif du template POML (ex: "prompts/topic-selector.poml"). */
    template?: string;
    /** Nombre max de topics à sélectionner par défaut */
    maxTopics?: number;
  };
  /**
   * Configuration du template POML pour l'Outline Writer.
   */
  outlineWriter?: {
    /** Chemin relatif du template POML (ex: "prompts/outline-writer.poml"). */
    template?: string;
    /** Nombre maximum de sections à générer (défaut: 9) */
    maxSections?: number;
    /** V3.1: Nombre cible de sections (1-15) */
    targetSectionsCount?: number;
    /** V3.1: Longueur cible totale de l'article en caractères (300-45000, outline writer decides per-section) */
    targetCharsArticle?: number;
  };
  /**
   * Configuration du template POML pour le Section Writer.
   */
  sectionWriter?: {
    /** Chemin relatif du template POML (ex: "prompts/section-writer.poml"). */
    template?: string;
  };
}

// ============================
// Sécurité (source des credentials)
// ============================
export interface SecurityConfig {
  credentials_source?: 'environment' | 'vault' | 'file';
  env_prefix?: string; // ex: JOHNDOE_ => JOHNDOE_GITHUB_TOKEN
}

// ============================
// Contexte Business (pour génération d'angles éditoriaux)
// ============================
export interface PersonaProfile {
  name: string;
  description: string;
  painPoints?: string[];
  goals?: string[];
}

export interface BusinessContextConfig {
  /** Industrie/secteur d'activité */
  industry: string;
  /** Type de site web (blog, e-commerce, corporate, etc.) */
  siteType?: string;
  /** Audience cible principale */
  targetAudience: string;
  /** Description business du projet (vision, mission, USP) */
  businessDescription?: string;
  /** Type de contenu produit (article, guide, tutorial, etc.) */
  contentType?: string;
  /**
   * Personas cibles détaillées (optionnel).
   * Format flexible - sera mappé vers PersonaProfile de @casys/core.
   * Structure minimale attendue: { category, archetype, profile, painPoints, motivations, messagingAngle }
   * Note: À terme, cette config sera en DB et non plus YAML-first.
   */
  personas?: any[];
}

// ============================
// Projet
// ============================
export interface ProjectConfig {
  name: string;
  type: 'astro' | 'wordpress' | 'hugo';
  /**
   * Langue principale du projet (code ISO 639-1: 'fr', 'en', 'es', etc.).
   * Utilisée par tous les services SEO, news et content discovery.
   * OBLIGATOIRE - fail-fast si manquant ou non supporté par language-region-mapper.
   */
  language: string;

  /**
   * Contexte business du projet (optionnel).
   * Utilisé par AngleSelectionWorkflow pour générer des angles pertinents.
   * Si absent, sera dérivé depuis generation.seoAnalysis.
   */
  businessContext?: BusinessContextConfig;

  sources: SourceConfig;
  publication: PublicationConfig;
  generation: GenerationConfig;
  security?: SecurityConfig;

  schedule?: {
    cron?: string;
    timezone?: string;
    enabled: boolean;
  };
}

// ============================
// Config générique (utilisée côté CLI pour la config globale locale)
// ============================
export interface ConfigSchema {
  apiUrl: string;
  defaultTenant: string;
}
