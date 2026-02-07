import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import matter from 'gray-matter';
import * as path from 'path';

import {
  type ArticleComment,
  type ArticleNode,
  type ArticleStructure,
  type SectionNode,
  type TextFragment,
  type ComponentUsage,
} from '@casys/core';
import { createLogger } from '../../../utils/logger';

interface NormalizedFrontmatter {
  title?: string;
  slug?: string;
  description?: string;
  language: string;
  createdAt?: string;
  keywords: string[];
  tags: string[];
  sources: string[];
  agents: string[];
}

/**
 * Service pour parser les fichiers MDX et extraire leur structure hiérarchique
 */
export class MdxParserService {
  private readonly logger = createLogger('MdxParser');

  /**
   * Parse un fichier MDX et extrait sa structure hiérarchique
   * @param filePath Chemin complet vers le fichier MDX
   * @param tenantId ID du tenant (optionnel, sera extrait du chemin si non fourni)
   * @param projectId ID du projet (optionnel, sera extrait du chemin si non fourni)
   */
  async parseArticleStructure(
    filePath: string,
    tenantId?: string,
    projectId?: string
  ): Promise<ArticleStructure> {
    try {
      // Extraction des IDs tenant et projet depuis le chemin si non fournis
      const ids = this.extractIdsFromPath(filePath, tenantId, projectId);
      const extractedTenantId = ids.tenantId;
      const extractedProjectId = ids.projectId;

      // Lecture du fichier MDX
      const fileContent = await fs.readFile(filePath, 'utf-8');

      // Extraction des métadonnées et du contenu avec gray-matter
      const parsed = matter(fileContent);
      const frontmatter = this.normalizeFrontmatter(parsed.data);
      const mdxContent = parsed.content;

      // Utilisation de l'ID extrait du nom de fichier
      const articleId = ids.articleId;

      // Création du noeud Article
      const articleNode: ArticleNode = {
        id: articleId,
        title: frontmatter.title ?? path.basename(filePath, path.extname(filePath)),
        slug: frontmatter.slug,
        description: frontmatter.description ?? '',
        language: frontmatter.language,
        createdAt: frontmatter.createdAt ?? new Date().toISOString(),
        keywords: frontmatter.keywords,
        sources: frontmatter.sources,
        agents: frontmatter.agents,
        tenantId: extractedTenantId,
        projectId: extractedProjectId,
        content: mdxContent,
      };

      // Extraction des sections, composants, fragments et commentaires
      const { sections, componentUsages, textFragments, comments } =
        this.extractSectionsAndComponents(mdxContent, articleId);

      // Auto-extraction des sources externes si le frontmatter est vide
      try {
        const extractedLinks = sections.flatMap(
          (s: SectionNode) => this.extractLinks(s.content ?? '').external
        );
        const autoSources = Array.from(new Set<string>(extractedLinks));
        if ((!articleNode.sources || articleNode.sources.length === 0) && autoSources.length > 0) {
          articleNode.sources = autoSources;
        }
      } catch {
        // non bloquant
      }

      return {
        article: articleNode,
        sections,
        componentUsages,
        textFragments,
        comments,
      };
    } catch (error: unknown) {
      this.logger.error(`Erreur lors du parsing du fichier MDX ${filePath}`, error as Error);
      throw new Error(`Erreur lors du parsing du fichier MDX: ${(error as Error).message}`);
    }
  }

  /**
   * Extrait les liens (internes/externes) d'un contenu markdown
   */
  extractLinks(markdown: string): { internal: string[]; external: string[] } {
    const internal: string[] = [];
    const external: string[] = [];
    if (!markdown || typeof markdown !== 'string') return { internal, external };

    // Markdown link: [text](href)
    const re = /\[[^\]]+\]\(([^)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(markdown)) !== null) {
      const href = (m[1] ?? '').trim();
      if (!href) continue;
      if (/^https?:\/\//i.test(href)) {
        // Exclure les ancrages absolus malformés
        try {
          // Valider URL
          new URL(href);
          external.push(href);
        } catch {
          // ignorer URL invalides
        }
      } else {
        // Filtrer mailto:, tel:, ancres
        if (/^(mailto:|tel:|#)/i.test(href)) continue;
        internal.push(href);
      }
    }

    // Dédupliquer
    const uniq = (arr: string[]) => Array.from(new Set(arr.map(s => s.trim()).filter(Boolean)));
    return { internal: uniq(internal), external: uniq(external) };
  }

  /**
   * Extrait les liens par section depuis une ArticleStructure
   */
  extractLinksForArticle(structure: ArticleStructure): {
    sectionId: string;
    internal: string[];
    external: string[];
  }[] {
    const out: { sectionId: string; internal: string[]; external: string[] }[] = [];
    const sections = structure?.sections ?? [];
    for (const s of sections) {
      const { internal, external } = this.extractLinks(s.content ?? '');
      out.push({ sectionId: s.id, internal, external });
    }
    return out;
  }

  /**
   * Parse du contenu MDX (string) directement sans lire de fichier
   * Utile pour parser du contenu récupéré depuis une API (ex: GitHub)
   * @param content Contenu MDX sous forme de string
   * @param tenantId ID du tenant (requis)
   * @param projectId ID du projet (requis)
   * @param articleIdHint Suggestion d'ID article (optionnel, sinon généré aléatoirement)
   */
  async parseArticleContent(
    content: string,
    tenantId: string,
    projectId: string,
    articleIdHint?: string
  ): Promise<ArticleStructure> {
    try {
      // Validation des paramètres requis
      if (!tenantId?.trim()) {
        throw new Error('[MdxParserService] tenantId requis pour parseArticleContent');
      }
      if (!projectId?.trim()) {
        throw new Error('[MdxParserService] projectId requis pour parseArticleContent');
      }
      if (!content?.trim()) {
        throw new Error('[MdxParserService] content ne peut pas être vide');
      }
      // Extraction des métadonnées et du contenu avec gray-matter
      const parsed = matter(content);
      const frontmatter = this.normalizeFrontmatter(parsed.data);
      const mdxContent = parsed.content;

      // Petite await pour satisfaire la règle lint (méthode async)
      await new Promise(resolve => setTimeout(resolve, 0));
      // Génération de l'ID article
      const articleId = articleIdHint?.trim() ?? this.generateArticleIdFromContent(content);

      // Création du noeud Article
      const articleNode: ArticleNode = {
        id: articleId,
        title: frontmatter.title ?? 'Untitled Article',
        description: frontmatter.description ?? '',
        language: frontmatter.language,
        createdAt: frontmatter.createdAt ?? new Date().toISOString(),
        keywords: frontmatter.keywords,
        sources: frontmatter.sources,
        agents: frontmatter.agents,
        tenantId,
        projectId,
        content: mdxContent,
      };

      // Extraction des sections, composants, fragments et commentaires
      const { sections, componentUsages, textFragments, comments } =
        this.extractSectionsAndComponents(mdxContent, articleId);

      // Auto-extraction des sources externes si le frontmatter est vide
      try {
        const extractedLinks = sections.flatMap(
          (s: SectionNode) => this.extractLinks(s.content ?? '').external
        );
        const autoSources = Array.from(new Set(extractedLinks));
        if ((!articleNode.sources || articleNode.sources.length === 0) && autoSources.length > 0) {
          articleNode.sources = autoSources;
        }
      } catch {
        // non bloquant
      }

      return {
        article: articleNode,
        sections,
        componentUsages,
        textFragments,
        comments,
      };
    } catch (error: unknown) {
      this.logger.error('Erreur lors du parsing du contenu MDX', error as Error);
      throw new Error(`Erreur lors du parsing du contenu MDX: ${(error as Error).message}`);
    }
  }

  /**
   * Génère un ID article basé sur le hash du contenu
   */
  private generateArticleIdFromContent(content: string): string {
    const hash = createHash('md5').update(content).digest('hex').substring(0, 8);
    return `article-${hash}`;
  }

  /**
   * Extrait les IDs de tenant et de projet depuis le chemin du fichier
   */
  private extractIdsFromPath(
    filePath: string,
    providedTenantId?: string,
    providedProjectId?: string
  ): { tenantId: string; projectId: string; articleId: string } {
    // Si les IDs sont fournis, on les utilise
    // Générer un ID canonique avec le nom de fichier + hash court
    const pathParts = filePath.split('/');
    const fileName = pathParts[pathParts.length - 1];
    const baseName = fileName.split('.')[0];
    // Générer un hash court basé sur le chemin complet pour la reproductibilité
    const hash = createHash('md5').update(filePath).digest('hex').substring(0, 8);
    const articleId = `${baseName}-${hash}`;

    if (providedTenantId) {
      const tenantId = providedTenantId;
      const projectId = providedProjectId ?? pathParts[pathParts.length - 2];
      return { tenantId, projectId, articleId };
    }

    // On cherche "articles" dans le chemin
    // Format attendu: /path/to/content/articles/tenantId/projectId/articleId.mdx
    const articlesIndex = pathParts.findIndex(part => part === 'articles');

    if (articlesIndex !== -1 && articlesIndex + 2 < pathParts.length) {
      const tenantId = pathParts[articlesIndex + 1];
      const projectId = pathParts[articlesIndex + 2];
      return { tenantId, projectId, articleId };
    }

    // Valeurs par défaut si on ne peut pas extraire
    return {
      tenantId: providedTenantId ?? 'unknown-tenant',
      projectId: providedProjectId ?? 'unknown-project',
      articleId,
    };
  }

  /**
   * Génère un slug à partir d'un titre
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Supprime les caractères spéciaux
      .replace(/\s+/g, '-') // Remplace les espaces par des tirets
      .replace(/--+/g, '-') // Évite les tirets multiples
      .trim();
  }

  private normalizeFrontmatter(data: unknown): NormalizedFrontmatter {
    const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};

    const toString = (value: unknown): string | undefined => {
      if (typeof value !== 'string') {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };

    const toStringArray = (value: unknown): string[] => {
      if (!Array.isArray(value)) {
        return [];
      }
      return value.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0
      );
    };

    const parseDateValue = (value: unknown): string | undefined => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
      }
      return undefined;
    };

    const createdAt = parseDateValue(record.date ?? record.createdAt);

    // Fusionner keywords ET tags dans keywords (compatibilité frontmatter)
    const keywordsArray = toStringArray(record.keywords);
    const tagsArray = toStringArray(record.tags);
    const mergedKeywords = Array.from(new Set([...keywordsArray, ...tagsArray]));

    return {
      title: toString(record.title),
      slug: toString(record.slug),
      description: toString(record.description),
      language: toString(record.language) ?? 'fr',
      createdAt,
      keywords: mergedKeywords,
      tags: toStringArray(record.tags), // Préservé pour compatibilité interne
      sources: toStringArray(record.sources),
      agents: toStringArray(record.agents),
    };
  }

  /**
   * Extrait les sections, composants, fragments et commentaires du contenu MDX
   */
  private extractSectionsAndComponents(
    content: string,
    articleId: string
  ): {
    sections: SectionNode[];
    componentUsages: ComponentUsage[];
    textFragments: TextFragment[];
    comments: ArticleComment[];
  } {
    const lines = content.split('\n');
    const sections: SectionNode[] = [];
    const componentUsages: ComponentUsage[] = [];
    const textFragments: TextFragment[] = [];
    const comments: ArticleComment[] = [];

    let currentH1: SectionNode | null = null;
    let currentH2: SectionNode | null = null;
    let currentH3: SectionNode | null = null;
    let currentH4: SectionNode | null = null;
    let currentH5: SectionNode | null = null;
    let currentH6: SectionNode | null = null;
    let currentSection: SectionNode | null = null;

    // Position séquentielle pour IDs canoniques
    let sectionPosition = 0;

    // Regex pour détecter les titres et composants (ordre important: du plus spécifique au plus général)
    // Utilisation d'assertions négatives pour éviter les chevauchements
    const h6Regex = /^[ \t]*######\s+(.+)$/;
    const h5Regex = /^[ \t]*#####(?!#)\s+(.+)$/;
    const h4Regex = /^[ \t]*####(?!#)\s+(.+)$/;
    const h3Regex = /^[ \t]*###(?!#)\s+(.+)$/;
    const h2Regex = /^[ \t]*##(?!#)\s+(.+)$/;
    const h1Regex = /^[ \t]*#(?!#)\s+(.+)$/;
    const componentRegex = /^[ \t]*<([A-Z][A-Za-z0-9]*)\s*([^>]*?)(?:\/?>|>.*?<\/\1>)$/;
    const heroRegex = /^[ \t]*<(Hero)\s*([^>]*)\/?>(?:(?:<\/\1>)?)$/; // Regex spécifique pour le Hero

    let lineIndex = 0;
    let heroFound = false; // Pour suivre si un Hero a été trouvé

    for (const line of lines) {
      // Détection du composant Hero (avant les titres)
      const heroMatch = heroRegex.exec(line);
      if (heroMatch && !heroFound) {
        // Créer une section de niveau 1 pour le Hero
        currentH1 = {
          id: randomUUID(),
          articleId,
          title: 'Hero Section', // Titre par défaut pour la section Hero
          level: 1,
          content: '', // TODO remplir le contenu avec le composant Hero
          position: lineIndex,
          parentSectionId: undefined,
        };
        sections.push(currentH1);
        currentSection = currentH1;
        currentH2 = null;
        currentH3 = null;
        heroFound = true;

        // Extraction des props du Hero
        const propsString = heroMatch[2] || '';
        const heroProps = this.extractComponentProps(propsString);

        // Ajout du composant Hero avec l'indicateur isSectionHeader
        // TODO: Adapter pour utiliser textFragmentId une fois les TextFragments implémentés
        // Pour l'instant, on utilise un textFragmentId temporaire basé sur la section
        const tempTextFragmentId = currentH1
          ? `${currentH1.id}-hero-fragment`
          : 'root-hero-fragment';

        componentUsages.push({
          id: randomUUID(),
          componentId: 'Hero',
          textFragmentId: tempTextFragmentId,
          props: heroProps,
          position: lineIndex,
          isSectionHeader: true, // Ce composant remplace un titre de section
        });

        // Continuer à la prochaine ligne
        lineIndex++;
        continue;
      }

      // Détection des titres (vérifier du plus spécifique au plus général)
      let matchedHeader = false;
      
      // Vérifier H6 en premier (le plus spécifique)
      const h6Match = h6Regex.exec(line);
      if (h6Match) {
        matchedHeader = true;
        // Nouveau titre H6 sous le H5 ou niveau supérieur disponible
        const canonicalId = `${articleId}::${sectionPosition}`;
        const parentId = currentH5
          ? currentH5.id
          : currentH4
            ? currentH4.id
            : currentH3
              ? currentH3.id
              : currentH2
                ? currentH2.id
                : currentH1
                  ? currentH1.id
                  : undefined;
        currentH6 = {
          id: canonicalId,
          articleId,
          title: h6Match[1].trim(),
          level: 6,
          position: sectionPosition++,
          parentSectionId: parentId,
          content: '', // Contenu vide initialement, sera rempli plus tard
        };
        sections.push(currentH6);
        currentSection = currentH6;
      }
      // Vérifier H5
      else if (h5Regex.exec(line)) {
        const h5Match = h5Regex.exec(line);
        if (h5Match) {
          matchedHeader = true;
          // Nouveau titre H5 sous le H4 ou niveau supérieur disponible
          const canonicalId = `${articleId}::${sectionPosition}`;
          const parentId = currentH4
            ? currentH4.id
            : currentH3
              ? currentH3.id
              : currentH2
                ? currentH2.id
                : currentH1
                  ? currentH1.id
                  : undefined;
          currentH5 = {
            id: canonicalId,
            articleId,
            title: h5Match[1].trim(),
            level: 5,
            position: sectionPosition++,
            parentSectionId: parentId,
            content: '', // Contenu vide initialement, sera rempli plus tard
          };
          sections.push(currentH5);
          currentSection = currentH5;
          currentH6 = null;
        }
      }
      // Vérifier H4
      else if (h4Regex.exec(line)) {
        const h4Match = h4Regex.exec(line);
        if (h4Match) {
          matchedHeader = true;
          // Nouveau titre H4 sous le H3 ou H2 ou H1 selon disponibilité
          const canonicalId = `${articleId}::${sectionPosition}`;
          const parentId = currentH3
            ? currentH3.id
            : currentH2
              ? currentH2.id
              : currentH1
                ? currentH1.id
                : undefined;
          currentH4 = {
            id: canonicalId,
            articleId,
            title: h4Match[1].trim(),
            level: 4,
            position: sectionPosition++,
            parentSectionId: parentId,
            content: '', // Contenu vide initialement, sera rempli plus tard
          };
          sections.push(currentH4);
          currentSection = currentH4;
          currentH5 = null;
          currentH6 = null;
        }
      }
      // Vérifier H3
      else if (h3Regex.exec(line)) {
        const h3Match = h3Regex.exec(line);
        if (h3Match) {
          matchedHeader = true;
          // Nouveau titre H3 sous le H2 courant ou sous le H1 si pas de H2
          const canonicalId = `${articleId}::${sectionPosition}`;
          const parentId = currentH2 ? currentH2.id : currentH1 ? currentH1.id : undefined;
          currentH3 = {
            id: canonicalId,
            articleId,
            title: h3Match[1].trim(),
            level: 3,
            position: sectionPosition++,
            parentSectionId: parentId,
            content: '', // Contenu vide initialement, sera rempli plus tard
          };
          sections.push(currentH3);
          currentSection = currentH3;
          currentH4 = null;
          currentH5 = null;
          currentH6 = null;
        }
      }
      // Vérifier H2 (SANS condition currentH1 - permettre sections orphelines)
      else if (h2Regex.exec(line)) {
        const h2Match = h2Regex.exec(line);
        if (h2Match) {
          matchedHeader = true;
          // Nouveau titre H2 sous le H1 courant (si existe) avec ID canonique
          const canonicalId = `${articleId}::${sectionPosition}`;
          currentH2 = {
            id: canonicalId,
            articleId,
            title: h2Match[1].trim(),
            level: 2,
            position: sectionPosition++,
            parentSectionId: currentH1?.id, // Peut être undefined si pas de H1
            content: '', // Contenu vide initialement, sera rempli plus tard
          };
          sections.push(currentH2);
          currentSection = currentH2;
          currentH3 = null;
          currentH4 = null;
          currentH5 = null;
          currentH6 = null;
        }
      }
      // Vérifier H1 en dernier (le plus général)
      else if (h1Regex.exec(line)) {
        const h1Match = h1Regex.exec(line);
        if (h1Match) {
          matchedHeader = true;
          // Nouveau titre H1 avec ID canonique
          const canonicalId = `${articleId}::${sectionPosition}`;
          currentH1 = {
            id: canonicalId,
            articleId,
            title: h1Match[1].trim(),
            level: 1,
            position: sectionPosition++,
            parentSectionId: undefined,
            content: '', // Contenu vide initialement, sera rempli plus tard
          };
          sections.push(currentH1);
          currentSection = currentH1;
          currentH2 = null;
          currentH3 = null;
          currentH4 = null;
          currentH5 = null;
          currentH6 = null;
        }
      }

      // Détection des composants standards (autres que Hero et CommentedText)
      const componentMatch = componentRegex.exec(line);
      if (
        componentMatch &&
        currentSection &&
        componentMatch[1] !== 'Hero' &&
        componentMatch[1] !== 'CommentedText'
      ) {
        const componentName = componentMatch[1];
        const propsString = componentMatch[2] || '';
        const props = this.extractComponentProps(propsString);

        // TODO: Adapter pour utiliser textFragmentId une fois les TextFragments implémentés
        // Pour l'instant, on utilise un textFragmentId temporaire basé sur la section
        const tempTextFragmentId = `${currentSection.id}-component-fragment-${lineIndex}`;

        componentUsages.push({
          id: randomUUID(),
          componentId: componentName,
          textFragmentId: tempTextFragmentId,
          props,
          position: lineIndex,
        });
      }

      // Accumuler le contenu textuel dans la section courante (hors lignes de titre)
      if (currentSection && !matchedHeader) {
        const prev = currentSection.content ?? '';
        currentSection.content = prev ? `${prev}\n${line}` : line;
      }

      lineIndex++;
    }

    // Extraction des CommentedText après création des sections (gère les éléments multi-lignes)
    this.extractCommentedTextFromContent(content, articleId, sections, textFragments, comments);

    return { sections, componentUsages, textFragments, comments };
  }

  /**
   * Extrait les CommentedText depuis tout le contenu (gère les éléments multi-lignes)
   */
  private extractCommentedTextFromContent(
    content: string,
    articleId: string,
    sections: SectionNode[],
    textFragments: TextFragment[],
    comments: ArticleComment[]
  ): void {
    // Regex pour capturer CommentedText avec support multi-lignes
    const commentedTextRegex = /<CommentedText\s+([^>]*?)>([\s\S]*?)<\/CommentedText>/g;
    let match: RegExpExecArray | null;

    while ((match = commentedTextRegex.exec(content)) !== null) {
      const propsString = match[1];
      const innerText = match[2].trim(); // Nettoyer les espaces et retours à la ligne

      // CommentedText détecté et traité

      const props = this.extractComponentProps(propsString);

      const commentId = props.id?.toString() ?? randomUUID();
      const fragmentId = `fragment-${commentId}`;

      // Trouver la section appropriée en fonction de la position du CommentedText
      const matchPosition = match.index;
      const currentSection = this.findSectionForPosition(content, matchPosition, sections);

      if (currentSection) {
        textFragments.push({
          id: fragmentId,
          content: innerText || 'Texte commenté',
          sectionId: currentSection.id,
          position: 0, // Position approximative
        });

        comments.push({
          id: commentId,
          articleId,
          textFragmentId: fragmentId,
          content: props.comment?.toString() ?? '',
          position: 0, // Position approximative
          authorId: undefined,
          createdAt: new Date().toISOString(),
          metadata: props,
        });
      }
    }
  }

  /**
   * Trouve la section appropriée pour une position donnée dans le contenu
   */
  private findSectionForPosition(
    content: string,
    position: number,
    sections: SectionNode[]
  ): SectionNode | null {
    if (sections.length === 0) return null;

    // Construire une carte des positions des sections dans le contenu
    const sectionPositions: { section: SectionNode; position: number }[] = [];

    sections.forEach(section => {
      // Chercher la position de chaque section dans le contenu
      const headerRegex = new RegExp(
        `^#{1,6}\\s+${section.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'm'
      );
      const headerMatch = headerRegex.exec(content);
      if (headerMatch?.index !== undefined) {
        sectionPositions.push({ section, position: headerMatch.index });
      }
    });

    // Trier par position
    sectionPositions.sort((a, b) => a.position - b.position);

    // Trouver la dernière section qui précède la position du CommentedText
    let targetSection = sectionPositions[0]?.section || sections[0]; // Par défaut, première section

    for (const { section, position: sectionPos } of sectionPositions) {
      if (sectionPos <= position) {
        targetSection = section;
      } else {
        break;
      }
    }

    return targetSection;
  }

  /**
   * Extrait les propriétés d'un composant à partir d'une chaîne de props
   */
  private extractComponentProps(propsString: string): Record<string, unknown> {
    const props: Record<string, unknown> = {};

    // Méthode plus robuste pour extraire les props avec gestion des accolades imbriquées
    let i = 0;
    while (i < propsString.length) {
      // Ignorer les espaces
      while (i < propsString.length && /\s/.test(propsString[i])) {
        i++;
      }

      if (i >= propsString.length) break;

      // Extraire le nom de la propriété
      let propName = '';
      while (i < propsString.length && /[a-zA-Z0-9_]/.test(propsString[i])) {
        propName += propsString[i];
        i++;
      }

      if (!propName) break;

      // Ignorer les espaces et vérifier le '='
      while (i < propsString.length && /\s/.test(propsString[i])) {
        i++;
      }

      if (i >= propsString.length || propsString[i] !== '=') break;
      i++; // passer le '='

      // Ignorer les espaces après '='
      while (i < propsString.length && /\s/.test(propsString[i])) {
        i++;
      }

      if (i >= propsString.length) break;

      let propValue: unknown;

      // Valeur entre accolades (objet ou expression)
      if (propsString[i] === '{') {
        let braceCount = 1;
        let valueStr = '';
        i++; // passer la première accolade

        while (i < propsString.length && braceCount > 0) {
          if (propsString[i] === '{') {
            braceCount++;
          } else if (propsString[i] === '}') {
            braceCount--;
          }

          if (braceCount > 0) {
            valueStr += propsString[i];
          }
          i++;
        }

        try {
          // Tentative de parsing JSON si c'est un objet valide
          propValue = JSON.parse(`{${valueStr}}`);
        } catch (_error) {
          // Sinon on garde la chaîne brute
          propValue = valueStr;
        }
      }
      // Valeur entre guillemets doubles
      else if (propsString[i] === '"') {
        let valueStr = '';
        i++; // passer le guillemet ouvrant

        while (i < propsString.length && propsString[i] !== '"') {
          if (propsString[i] === '\\' && i + 1 < propsString.length) {
            // Gérer les caractères échappés
            i++;
            valueStr += propsString[i];
          } else {
            valueStr += propsString[i];
          }
          i++;
        }

        if (i < propsString.length) i++; // passer le guillemet fermant
        propValue = valueStr;
      }
      // Valeur entre guillemets simples
      else if (propsString[i] === "'") {
        let valueStr = '';
        i++; // passer le guillemet ouvrant

        while (i < propsString.length && propsString[i] !== "'") {
          if (propsString[i] === '\\' && i + 1 < propsString.length) {
            // Gérer les caractères échappés
            i++;
            valueStr += propsString[i];
          } else {
            valueStr += propsString[i];
          }
          i++;
        }

        if (i < propsString.length) i++; // passer le guillemet fermant
        propValue = valueStr;
      } else {
        // Valeur sans délimiteurs (booléen, nombre, etc.)
        let valueStr = '';
        while (
          i < propsString.length &&
          !/\s/.test(propsString[i]) &&
          propsString[i] !== '=' &&
          propsString[i] !== '{' &&
          propsString[i] !== '"' &&
          propsString[i] !== "'"
        ) {
          valueStr += propsString[i];
          i++;
        }
        propValue = valueStr;
      }

      if (propName) {
        props[propName] = propValue;
      }
    }

    return props;
  }
}
