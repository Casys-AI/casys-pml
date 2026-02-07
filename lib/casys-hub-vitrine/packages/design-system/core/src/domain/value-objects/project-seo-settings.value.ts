export interface ProjectSeoSettingsProps {
  tenantId: string;
  projectId: string;
  language: string;
  siteUrl?: string;
  seoAnalysis?: {
    keywords?: string[]; // seed keywords (raw, will be trimmed/deduped)
    industry?: string;
    contentType?: string;
    targetAudience?: string;
    businessDescription?: string;
  };
}

export class ProjectSeoSettings {
  private constructor(
    private readonly _tenantId: string,
    private readonly _projectId: string,
    private readonly _language: string,
    private readonly _siteUrl?: string,
    private readonly _seo?: {
      keywords: string[];
      industry?: string;
      contentType?: string;
      targetAudience?: string;
      businessDescription?: string;
    }
  ) {}

  static create(props: ProjectSeoSettingsProps): ProjectSeoSettings {
    const tenantId = String(props.tenantId ?? '').trim();
    const projectId = String(props.projectId ?? '').trim();
    const language = String(props.language ?? '').trim();
    if (!tenantId) throw new Error('ProjectSettings: tenantId requis');
    if (!projectId) throw new Error('ProjectSettings: projectId requis');
    if (!language) throw new Error('ProjectSettings: language requis');

    const sanitizeStrings = (arr?: unknown): string[] => {
      if (!Array.isArray(arr)) return [];
      return Array.from(
        new Set(
          arr
            .filter((v): v is string => typeof v === 'string')
            .map(v => v.trim())
            .filter(v => v.length > 0)
        )
      );
    };

    const siteUrl = props.siteUrl?.trim() ?? undefined;

    const seo = props.seoAnalysis
      ? {
          keywords: sanitizeStrings(props.seoAnalysis.keywords),
          industry: props.seoAnalysis.industry?.trim() ?? undefined,
          contentType: props.seoAnalysis.contentType?.trim() ?? undefined,
          targetAudience: props.seoAnalysis.targetAudience?.trim() ?? undefined,
          businessDescription: props.seoAnalysis.businessDescription?.trim() ?? undefined,
        }
      : { keywords: [] as string[] };

    return new ProjectSeoSettings(tenantId, projectId, language, siteUrl, seo);
  }

  get tenantId(): string { return this._tenantId; }
  get projectId(): string { return this._projectId; }
  get language(): string { return this._language; }
  get siteUrl(): string | undefined { return this._siteUrl; }

  // Seed keywords (raw list from config, sanitized & deduped)
  get seedKeywords(): string[] { return this._seo?.keywords ?? []; }
  get industry(): string | undefined { return this._seo?.industry; }
  get contentType(): string | undefined { return this._seo?.contentType; }
  get targetAudience(): string | undefined { return this._seo?.targetAudience; }
  get businessDescription(): string | undefined { return this._seo?.businessDescription; }
}
