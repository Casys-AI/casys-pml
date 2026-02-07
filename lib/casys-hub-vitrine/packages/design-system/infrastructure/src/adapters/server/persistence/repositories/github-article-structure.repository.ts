import { Octokit } from '@octokit/core';

import type { ProjectConfig } from '@casys/shared';
import type { ArticleStructure } from '@casys/core';
import {
  type ArticleReadPort,
  type ArticleStructureRepositoryPort,
  type UserProjectConfigPort,
} from '@casys/application';

import { createLogger } from '../../../../utils/logger';
import { type MdxParserService } from '../../parsers/mdx-parser.adapter';

/**
 * Repository pour les structures d'articles MDX hébergés sur GitHub
 * Utilise l'API GitHub pour lister et récupérer les fichiers .mdx
 * Structure attendue dans le repo: content_path/tenant-id/project-id/article.mdx
 */
export class GithubArticleStructureRepository
  implements ArticleStructureRepositoryPort, ArticleReadPort
{
  private readonly logger = createLogger('GithubArticleStructureRepository');

  constructor(
    private readonly configReader: UserProjectConfigPort,
    private readonly mdxParser: MdxParserService
  ) {}

  /**
   * Résout le token GitHub en fonction de la config projet
   */
  private resolveGithubToken(projectConfig: ProjectConfig): string {
    const gh = projectConfig.publication?.github;
    const security = projectConfig.security;

    // Mode PR: GITHUB_TOKEN uniquement (fourni par GitHub Actions)
    if (gh?.connection === 'pr') {
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        throw new Error(
          '[GithubArticleStructureRepository] Mode PR: GITHUB_TOKEN requis (fourni par GitHub Actions)'
        );
      }
      return token;
    }

    // Mode direct: token avec prefix
    const envPrefix = security?.env_prefix ?? '';
    const tokenKey = `${envPrefix}GITHUB_TOKEN`;
    const token = process.env[tokenKey];

    if (!token) {
      throw new Error(
        `[GithubArticleStructureRepository] Mode direct: ${tokenKey} requis dans l'environnement`
      );
    }

    return token;
  }

  /**
   * Récupère le contenu d'un fichier depuis GitHub
   */
  private async fetchFileContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<string> {
    try {
      const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path,
        ref,
        headers: {
          accept: 'application/vnd.github.v3.raw', // Récupère le contenu brut directement
        },
      });

      // Le contenu est déjà en string avec le header raw
      if (typeof response.data === 'string') {
        return response.data;
      }

      // Fallback si le format n'est pas raw
      if ('content' in response.data && typeof response.data.content === 'string') {
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      }

      throw new Error('Format de réponse GitHub inattendu');
    } catch (error) {
      this.logger.error(`Erreur lors de la récupération du fichier ${path}`, error);
      throw error;
    }
  }

  /**
   * Liste les fichiers .md ou .mdx d'un répertoire GitHub (non récursif)
   */
  private async listMdxFiles(
    octokit: Octokit,
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<{ name: string; path: string; sha: string }[]> {
    try {
      const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path,
        ref,
      });

      if (!Array.isArray(response.data)) {
        this.logger.warn(`Le chemin ${path} n'est pas un répertoire`);
        return [];
      }

      return response.data
        .filter((item: { type: string; name: string }) => {
          if (item.type !== 'file') return false;
          const lower = (item.name ?? '').toLowerCase();
          return lower.endsWith('.mdx') || lower.endsWith('.md');
        })
        .map((item: { name: string; path: string; sha: string }) => ({
          name: item.name,
          path: item.path,
          sha: item.sha,
        }));
    } catch (error) {
      // Si le répertoire n'existe pas, retourne un tableau vide
      if ((error as { status?: number }).status === 404) {
        this.logger.debug(`Répertoire non trouvé: ${path}`);
        return [];
      }
      this.logger.error(`Erreur lors du listing des fichiers dans ${path}`, error);
      throw error;
    }
  }

  /**
   * Trouve toutes les structures d'articles dans l'arborescence complète
   * Note: Pour GitHub, cela nécessite de scanner tous les tenants/projets configurés
   */
  async findAll(): Promise<ArticleStructure[]> {
    this.logger.warn(
      'findAll() non implémenté pour GitHub (nécessite de connaître tous les tenants/projets)'
    );
    return [];
  }

  /**
   * Trouve toutes les structures d'articles d'un tenant
   */
  async findByTenant(tenantId: string): Promise<ArticleStructure[]> {
    this.logger.warn(
      `findByTenant(${tenantId}) non implémenté pour GitHub (nécessite de lister tous les projets du tenant)`
    );
    return [];
  }

  /**
   * Liste les projets existants pour un tenant donné
   */
  async listProjectsByTenant(tenantId: string): Promise<string[]> {
    this.logger.warn(`listProjectsByTenant(${tenantId}) non implémenté pour GitHub`);
    return [];
  }

  /**
   * Trouve toutes les structures d'articles d'un projet spécifique
   * C'est la méthode principale pour indexer depuis GitHub
   */
  async findByProject(tenantId: string, projectId: string): Promise<ArticleStructure[]> {
    this.logger.debug(
      `Scanning articles from GitHub for tenant: ${tenantId}, project: ${projectId}`
    );

    try {
      // 1. Charger la config projet
      const projectConfig = await this.configReader.getProjectConfig(tenantId, projectId);
      const gh = projectConfig.publication?.github;

      // Fail-fast: vérifier que GitHub est configuré et activé
      if (!gh?.enabled) {
        this.logger.debug('GitHub publication non activée pour ce projet');
        return [];
      }

      if (!gh.repo?.trim() || !gh.branch?.trim() || !gh.content_path?.trim()) {
        throw new Error(
          '[GithubArticleStructureRepository] Configuration GitHub incomplète (repo, branch, content_path requis)'
        );
      }

      // 2. Résoudre le token
      const token = this.resolveGithubToken(projectConfig);
      const octokit = new Octokit({ auth: token });

      // 3. Parser repo (format: owner/repo)
      const [owner, repoName] = gh.repo.split('/');
      if (!owner || !repoName) {
        throw new Error(
          `[GithubArticleStructureRepository] Format repo invalide: ${gh.repo} (attendu: owner/repo)`
        );
      }

      // 4. Construire le chemin vers les articles du projet
      // Le content_path est utilisé tel quel (la structure tenant/project est gérée par la config)
      const contentPathSanitized = gh.content_path.replace(/^\/+|\/+$/g, '');
      const projectPath = contentPathSanitized;

      this.logger.debug(`Scanning GitHub path: ${owner}/${repoName}/${projectPath} @ ${gh.branch}`);

      // 5. Lister les fichiers .mdx
      const mdxFiles = await this.listMdxFiles(octokit, owner, repoName, projectPath, gh.branch);
      this.logger.debug(`Found ${mdxFiles.length} .mdx files in ${projectPath}`);

      // 6. Parser chaque fichier
      const articles: ArticleStructure[] = [];
      for (const file of mdxFiles) {
        try {
          // Récupérer le contenu
          const content = await this.fetchFileContent(
            octokit,
            owner,
            repoName,
            file.path,
            gh.branch
          );

          // Parser avec le MdxParser (qui attend un chemin, on passe le contenu)
          // Note: parseArticleStructure attend normalement un chemin fichier
          // On utilise parseArticleContent si disponible, sinon on crée un fichier temporaire
          const articleStructure = await this.mdxParser.parseArticleContent(
            content,
            tenantId,
            projectId
          );

          articles.push(articleStructure);
          this.logger.debug(`Parsed article: ${articleStructure.article.id}`);
        } catch (error) {
          this.logger.error(`Error parsing file ${file.name}`, error);
          // Continue avec les autres fichiers
        }
      }

      this.logger.debug(
        `Successfully parsed ${articles.length} articles for project ${tenantId}/${projectId}`
      );
      return articles;
    } catch (error) {
      this.logger.error('Error scanning project from GitHub', { tenantId, projectId, error });
      throw error;
    }
  }

  /**
   * Trouve une structure d'article par son ID
   * Note: Nécessite de scanner tous les projets (coûteux)
   */
  async findById(articleId: string): Promise<ArticleStructure | null> {
    this.logger.warn(
      `findById(${articleId}) non implémenté pour GitHub (nécessite de connaître tenant/project)`
    );
    return null;
  }

  /**
   * Trouve une structure d'article par son chemin exact
   */
  async findByPath(
    tenantId: string,
    projectId: string,
    fileName: string
  ): Promise<ArticleStructure | null> {
    this.logger.debug(`Loading article from GitHub: ${tenantId}/${projectId}/${fileName}`);

    try {
      const projectConfig = await this.configReader.getProjectConfig(tenantId, projectId);
      const gh = projectConfig.publication?.github;

      if (!gh?.enabled || !gh.repo || !gh.branch || !gh.content_path) {
        return null;
      }

      const token = this.resolveGithubToken(projectConfig);
      const octokit = new Octokit({ auth: token });

      const [owner, repoName] = gh.repo.split('/');
      if (!owner || !repoName) return null;

      const contentPathSanitized = gh.content_path.replace(/^\/+|\/+$/g, '');
      const filePath = `${contentPathSanitized}/${tenantId}/${projectId}/${fileName}`;

      const content = await this.fetchFileContent(octokit, owner, repoName, filePath, gh.branch);
      const articleStructure = await this.mdxParser.parseArticleContent(
        content,
        tenantId,
        projectId
      );

      this.logger.debug(`Loaded article from GitHub: ${articleStructure.article.id}`);
      return articleStructure;
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        this.logger.debug(`File not found: ${fileName}`);
        return null;
      }
      this.logger.error('Error loading article from GitHub', {
        tenantId,
        projectId,
        fileName,
        error,
      });
      return null;
    }
  }

  /**
   * Sauvegarde une structure d'article
   * Note: Non implémenté pour GitHub (lecture seule)
   */
  save(_articleStructure: ArticleStructure): Promise<void> {
    this.logger.warn('save() non implémenté pour GithubArticleStructureRepository (lecture seule)');
    return Promise.reject(
      new Error('Save operation not implemented for GithubArticleStructureRepository')
    );
  }

  /**
   * Supprime une structure d'article
   * Note: Non implémenté pour GitHub (lecture seule)
   */
  delete(_articleId: string): Promise<void> {
    this.logger.warn(
      'delete() non implémenté pour GithubArticleStructureRepository (lecture seule)'
    );
    return Promise.reject(
      new Error('Delete operation not implemented for GithubArticleStructureRepository')
    );
  }
}
