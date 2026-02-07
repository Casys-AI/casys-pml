import type { UserProjectConfigPort } from '@casys/application';

import { createLogger } from '../../../../utils/logger';

type GraphBackend = 'kuzu' | 'neo4j';

export class BootstrapService {
  private readonly logger = createLogger('BootstrapService');
  private readonly backend: GraphBackend;

  constructor(
    private readonly executeQuery: (
      query: string,
      params?: Record<string, unknown>
    ) => Promise<unknown>,
    backend?: GraphBackend
  ) {
    // Auto-detect backend from env, default to kuzu
    this.backend = backend ?? (String(process.env.GRAPH_BACKEND ?? 'kuzu').toLowerCase() as GraphBackend);
    this.logger.debug(`BootstrapService initialized with backend: ${this.backend}`);
  }

  /**
   * Exécute une requête avec logs détaillés (diagnostic segfault)
   */
  private async exec(
    label: string,
    query: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    this.logger.debug(`[BOOTSTRAP][BEGIN] ${label}`, { params });
    try {
      const res = await this.executeQuery(query, params);
      this.logger.debug(`[BOOTSTRAP][OK] ${label}`);
      return res;
    } catch (e) {
      this.logger.error(`[BOOTSTRAP][ERR] ${label}: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }

  // Helper: génère la valeur et l'expression pour timestamp selon le backend
  private getTimestampExpr(): { expr: string; value: number | string } {
    if (this.backend === 'neo4j') {
      return { expr: '$now', value: Date.now() };
    }
    // Kuzu
    return { expr: 'CAST($now AS TIMESTAMP)', value: new Date().toISOString() };
  }

  // Idempotent: crée/mettre à jour Tenant et Project, et rel TENANT_HAS_PROJECT
  async upsertTenantAndProject(params: {
    tenantId: string;
    tenantName: string;
    projectId: string;
    projectName: string;
  }): Promise<void> {
    const { tenantId, tenantName, projectId, projectName } = params;

    if (!tenantId?.trim()) throw new Error('tenantId requis');
    if (!tenantName?.trim()) throw new Error('tenantName requis');
    if (!projectId?.trim()) throw new Error('projectId requis');
    if (!projectName?.trim()) throw new Error('projectName requis');

    const { expr: nowExpr, value: nowValue } = this.getTimestampExpr();

    // Tenant
    const mergeTenant = `
      MERGE (t:Tenant { id: $tenantId })
      ON CREATE SET t.name = $tenantName, t.created_at = ${nowExpr}
      ON MATCH SET  t.name = $tenantName
    `;
    await this.exec('mergeTenant', mergeTenant, {
      tenantId,
      tenantName,
      now: nowValue,
    });

    // Project
    const mergeProject = `
      MERGE (p:Project { id: $projectId })
      ON CREATE SET p.name = $projectName, p.description = NULL, p.tenant_id = $tenantId, p.created_at = ${nowExpr}
      ON MATCH SET  p.name = $projectName, p.tenant_id = $tenantId, p.updated_at = ${nowExpr}
    `;
    await this.exec('mergeProject', mergeProject, {
      projectId,
      projectName,
      tenantId,
      now: nowValue,
    });

    // Relation Tenant -> Project
    const linkRel = `
      MATCH (t:Tenant { id: $tenantId })
      MATCH (p:Project { id: $projectId })
      MERGE (t)-[:TENANT_HAS_PROJECT]->(p)
    `;
    await this.exec('linkTenantProject', linkRel, { tenantId, projectId });

    this.logger.log('Tenant/Project bootstrapped', {
      tenantId,
      tenantName,
      projectId,
      projectName,
    });
  }

  // Bootstrap depuis les fichiers de config (config/users/**)
  // 1) Crée/MAJ Tenant & Project et la relation TENANT_HAS_PROJECT
  // 2) Retourne la liste des tâches d'indexation de seeds par projet (baseKeywords)
  async bootstrapFromConfig(configReader: UserProjectConfigPort): Promise<
    {
      tenantId: string;
      tenantName: string;
      projectId: string;
      projectName: string;
      baseKeywords: string[];
    }[]
  > {
    if (!configReader) throw new Error('configReader requis');
    const tasks: {
      tenantId: string;
      tenantName: string;
      projectId: string;
      projectName: string;
      baseKeywords: string[];
    }[] = [];

    const onlyTenant = (process.env.KUZU_BOOTSTRAP_ONLY_TENANT ?? '').trim();
    const onlyProject = (process.env.KUZU_BOOTSTRAP_ONLY_PROJECT ?? '').trim();
    const maxKwStr = (process.env.KUZU_BOOTSTRAP_MAX_KEYWORDS ?? '').trim();
    const maxKeywords = maxKwStr ? Math.max(0, Number(maxKwStr)) : undefined;

    const usersAll = await configReader.listUsers();
    const users = onlyTenant ? usersAll.filter(u => u === onlyTenant) : usersAll;
    for (const tenantId of users) {
      const userCfg = await configReader.getUserConfig(tenantId);
      const tenantName = (userCfg.name ?? tenantId).trim();
      const projectsAll = await configReader.listUserProjects(tenantId);
      const projects = onlyProject ? projectsAll.filter(p => p === onlyProject) : projectsAll;

      for (const projectId of projects) {
        const projectCfg = await configReader.getProjectConfig(tenantId, projectId);
        const projectName = (projectCfg.name ?? projectId).trim();

        await this.upsertTenantAndProject({ tenantId, tenantName, projectId, projectName });

        // Lecture défensive des keywords
        let baseKeywords: string[] = [];
        const generation: unknown = (projectCfg as unknown as Record<string, unknown>)?.generation;
        if (generation && typeof generation === 'object') {
          // Alignement: les seeds viennent de generation.seoAnalysis.keywords
          const genObj = generation as { seoAnalysis?: unknown };
          const seoAnalysis = genObj.seoAnalysis;
          if (seoAnalysis && typeof seoAnalysis === 'object') {
            const seoObj = seoAnalysis as { keywords?: unknown };
            const kws = seoObj.keywords;
            if (Array.isArray(kws)) {
              baseKeywords = kws.filter(
                (k: unknown): k is string => typeof k === 'string' && k.trim().length > 0
              );
            }
          }
        }

        const limitedKeywords =
          typeof maxKeywords === 'number' && maxKeywords >= 0
            ? baseKeywords.slice(0, maxKeywords)
            : baseKeywords;

        this.logger.debug('[BOOTSTRAP] Task prepared', {
          tenantId,
          projectId,
          baseKeywordsCount: limitedKeywords.length,
        });

        tasks.push({ tenantId, tenantName, projectId, projectName, baseKeywords: limitedKeywords });
      }
    }

    this.logger.log('Bootstrap structure terminé (config-driven)', {
      users: users.length,
      tasks: tasks.length,
    });
    return tasks;
  }
}
