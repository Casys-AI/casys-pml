import type { ProjectSeoSettingsPort } from '../../ports/out';
import type { UserProjectConfigPort } from '../../ports/out';

export interface PrepareContextInput {
  keywords: string[];
  tenantId?: string;
  projectId?: string;
}

export interface PrepareContextResult {
  tId: string;
  pId: string;
  language: string;
  settings: Awaited<ReturnType<ProjectSeoSettingsPort['getSeoProjectSettings']>>;
}

export class PrepareContextService {
  constructor(
    private readonly configReader: UserProjectConfigPort,
    private readonly projectSettings: ProjectSeoSettingsPort
  ) {}

  async execute(input: PrepareContextInput): Promise<PrepareContextResult> {
    const { keywords, tenantId, projectId } = input;

    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error('keywords is required and must be a non-empty array');
    }
    if (!tenantId || !projectId) {
      throw new Error('tenantId et projectId requis');
    }

    const cfg = await this.configReader.getProjectConfig(tenantId, projectId);
    const settings = await this.projectSettings.getSeoProjectSettings(tenantId, projectId);

    const language = settings.language || cfg.language || 'fr';

    return { tId: tenantId, pId: projectId, language, settings };
  }
}
