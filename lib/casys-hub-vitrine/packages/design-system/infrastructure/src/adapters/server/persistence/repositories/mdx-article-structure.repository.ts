import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { type ArticleStructure } from '@casys/core';
import { type ArticleReadPort, type ArticleStructureRepositoryPort } from '@casys/application';

import { createLogger } from '../../../../utils/logger';
import { type MdxParserService } from '../../parsers/mdx-parser.adapter';

/**
 * Repository pour les structures d'articles MDX avec granularité tenant/project
 * Structure attendue: rootDir/tenant-id/project-id/article.mdx
 */
export class MdxArticleStructureRepository
  implements ArticleStructureRepositoryPort, ArticleReadPort
{
  private readonly logger = createLogger('MdxArticleStructureRepository');

  constructor(
    private readonly rootDir: string,
    private readonly mdxParser: MdxParserService
  ) {}

  /**
   * Trouve toutes les structures d'articles dans l'arborescence complète
   */
  async findAll(): Promise<ArticleStructure[]> {
    this.logger.debug('Scanning all articles');
    this.logger.debug(`DEBUG: Repository.findAll() - rootDir: ${this.rootDir}`);
    this.logger.debug('DEBUG: Repository.findAll() - checking if rootDir exists');
    const articles: ArticleStructure[] = [];

    try {
      if (!(await this.directoryExists(this.rootDir))) {
        this.logger.debug(`Root directory not found: ${this.rootDir}`);
        return [];
      }
      const tenantDirs = await this.getTenantDirectories();
      this.logger.debug(`DEBUG: Repository.findAll() - tenantDirs found: ${tenantDirs.join(',')}`);

      for (const tenantDir of tenantDirs) {
        const tenantArticles = await this.findByTenant(tenantDir);
        articles.push(...tenantArticles);
      }

      this.logger.debug(`Found ${articles.length} articles total`);
      return articles;
    } catch (error) {
      this.logger.error('Error scanning all articles', error);
      return [];
    }
  }

  /**
   * Liste les projets existants pour un tenant donné
   */
  async listProjectsByTenant(tenantId: string): Promise<string[]> {
    this.logger.debug(`Listing projects for tenant: ${tenantId}`);
    try {
      const tenantPath = join(this.rootDir, tenantId);
      if (!(await this.directoryExists(tenantPath))) {
        this.logger.debug(`Tenant directory not found: ${tenantPath}`);
        return [];
      }

      const entries = await readdir(tenantPath, { withFileTypes: true });
      const projects = entries.filter(e => e.isDirectory()).map(e => e.name);
      this.logger.debug(`Found ${projects.length} projects for tenant ${tenantId}`);
      return projects;
    } catch (error) {
      this.logger.error('Error listing projects for tenant', { tenantId, error });
      return [];
    }
  }

  /**
   * Trouve toutes les structures d'articles d'un tenant
   */
  async findByTenant(tenantId: string): Promise<ArticleStructure[]> {
    this.logger.debug(`Scanning articles for tenant: ${tenantId}`);
    const articles: ArticleStructure[] = [];

    try {
      const tenantPath = join(this.rootDir, tenantId);
      if (!(await this.directoryExists(tenantPath))) {
        this.logger.debug(`Tenant directory not found: ${tenantPath}`);
        return [];
      }

      const projectDirs = await this.getProjectDirectories(tenantId);

      for (const projectDir of projectDirs) {
        const projectArticles = await this.findByProject(tenantId, projectDir);
        articles.push(...projectArticles);
      }

      this.logger.debug(`Found ${articles.length} articles for tenant ${tenantId}`);
      return articles;
    } catch (error) {
      this.logger.error('Error scanning tenant', { tenantId, error });
      return [];
    }
  }

  /**
   * Trouve toutes les structures d'articles d'un projet
   */
  async findByProject(tenantId: string, projectId: string): Promise<ArticleStructure[]> {
    this.logger.debug(`Scanning articles for tenant: ${tenantId}, project: ${projectId}`);
    const articles: ArticleStructure[] = [];

    try {
      const projectPath = join(this.rootDir, tenantId, projectId);
      if (!(await this.directoryExists(projectPath))) {
        this.logger.debug(`Project directory not found: ${projectPath}`);
        return [];
      }

      const files = await readdir(projectPath);
      const mdxFiles = files.filter((file: string) => {
        const lower = (file ?? '').toLowerCase();
        return lower.endsWith('.mdx') || lower.endsWith('.md');
      });

      for (const file of mdxFiles) {
        const filePath = join(projectPath, file);
        try {
          const articleStructure = await this.mdxParser.parseArticleStructure(
            filePath,
            tenantId,
            projectId
          );
          articles.push(articleStructure);
        } catch (error) {
          this.logger.error('Error parsing file', { filePath, error });
          // Continue with other files
        }
      }

      this.logger.debug(`Found ${articles.length} articles for project ${tenantId}/${projectId}`);
      return articles;
    } catch (error) {
      this.logger.error('Error scanning project', { tenantId, projectId, error });
      return [];
    }
  }

  /**
   * Trouve une structure d'article par son ID (recherche dans toute l'arborescence)
   */
  async findById(articleId: string): Promise<ArticleStructure | null> {
    this.logger.debug(`Searching for article ID: ${articleId}`);

    try {
      const tenantDirs = await this.getTenantDirectories();

      for (const tenantDir of tenantDirs) {
        const projectDirs = await this.getProjectDirectories(tenantDir);

        for (const projectDir of projectDirs) {
          const projectPath = join(this.rootDir, tenantDir, projectDir);
          const files = await readdir(projectPath);

          for (const file of files) {
            if (file.endsWith('.mdx')) {
              const filePath = join(projectPath, file);
              try {
                const articleStructure = await this.mdxParser.parseArticleStructure(
                  filePath,
                  tenantDir,
                  projectDir
                );

                if (articleStructure.article.id === articleId) {
                  this.logger.debug(`Found article ${articleId} at ${filePath}`);
                  return articleStructure;
                }
              } catch (error) {
                this.logger.error('Error parsing file while searching', { filePath, error });
                // Continue searching
              }
            }
          }
        }
      }

      this.logger.debug(`Article ${articleId} not found`);
      return null;
    } catch (error) {
      this.logger.error('Error searching for article', { articleId, error });
      return null;
    }
  }

  /**
   * Trouve une structure d'article par son chemin exact
   */
  async findByPath(
    tenantId: string,
    projectId: string,
    fileName: string
  ): Promise<ArticleStructure | null> {
    const filePath = join(this.rootDir, tenantId, projectId, fileName);
    this.logger.debug(`Loading article from path: ${filePath}`);

    try {
      if (!(await this.fileExists(filePath))) {
        this.logger.debug(`File not found: ${filePath}`);
        return null;
      }

      const articleStructure = await this.mdxParser.parseArticleStructure(
        filePath,
        tenantId,
        projectId
      );

      this.logger.debug(`Loaded article from ${filePath}`);
      return articleStructure;
    } catch (error) {
      this.logger.error('Error loading article from path', { filePath, error });
      return null;
    }
  }

  /**
   * Sauvegarde une structure d'article (CRUD)
   * TODO: Implémenter la sauvegarde dans le filesystem
   */
  save(_articleStructure: ArticleStructure): Promise<void> {
    this.logger.warn('Save operation not implemented yet');
    return Promise.reject(
      new Error('Save operation not implemented for MdxArticleStructureRepository')
    );
  }

  /**
   * Supprime une structure d'article par son ID
   * TODO: Implémenter la suppression dans le filesystem
   */
  delete(_articleId: string): Promise<void> {
    this.logger.warn('Delete operation not implemented yet');
    return Promise.reject(
      new Error('Delete operation not implemented for MdxArticleStructureRepository')
    );
  }

  // === Méthodes privées pour l'accès filesystem ===

  private async getTenantDirectories(): Promise<string[]> {
    try {
      if (!(await this.directoryExists(this.rootDir))) {
        return [];
      }

      const entries = await readdir(this.rootDir, { withFileTypes: true });
      return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
    } catch (error) {
      this.logger.error('Error reading tenant directories', error);
      return [];
    }
  }

  private async getProjectDirectories(tenantId: string): Promise<string[]> {
    try {
      const tenantPath = join(this.rootDir, tenantId);
      const entries = await readdir(tenantPath, { withFileTypes: true });
      return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
    } catch (error) {
      this.logger.error('Error reading project directories for tenant', { tenantId, error });
      return [];
    }
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const statResult = await stat(dirPath);
      return statResult.isDirectory();
    } catch {
      return false;
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const statResult = await stat(filePath);
      return statResult.isFile();
    } catch {
      return false;
    }
  }
}
