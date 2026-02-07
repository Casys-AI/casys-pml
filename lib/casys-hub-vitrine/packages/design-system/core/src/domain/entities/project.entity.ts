/**
 * Entité Project
 * Représente un projet au sein d'un tenant
 */
export interface ProjectProps {
  id: string;
  tenantId: string;
  name?: string;
  description?: string;
  language?: string;
  siteUrl?: string;
  industry?: string;
  targetAudience?: string;
  contentType?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class Project {
  private constructor(
    private readonly _id: string,
    private readonly _tenantId: string,
    private readonly _name?: string,
    private readonly _description?: string,
    private readonly _language?: string,
    private readonly _siteUrl?: string,
    private readonly _industry?: string,
    private readonly _targetAudience?: string,
    private readonly _contentType?: string,
    private readonly _createdAt?: string,
    private readonly _updatedAt?: string
  ) {}

  static create(props: ProjectProps): Project {
    const id = String(props.id ?? '').trim();
    const tenantId = String(props.tenantId ?? '').trim();
    
    if (!id) throw new Error('Project: id requis');
    if (!tenantId) throw new Error('Project: tenantId requis');

    return new Project(
      id,
      tenantId,
      props.name?.trim(),
      props.description?.trim(),
      props.language?.trim(),
      props.siteUrl?.trim(),
      props.industry?.trim(),
      props.targetAudience?.trim(),
      props.contentType?.trim(),
      props.createdAt,
      props.updatedAt
    );
  }

  get id(): string {
    return this._id;
  }

  get tenantId(): string {
    return this._tenantId;
  }

  get name(): string | undefined {
    return this._name;
  }

  get description(): string | undefined {
    return this._description;
  }

  get language(): string | undefined {
    return this._language;
  }

  get siteUrl(): string | undefined {
    return this._siteUrl;
  }

  get industry(): string | undefined {
    return this._industry;
  }

  get targetAudience(): string | undefined {
    return this._targetAudience;
  }

  get contentType(): string | undefined {
    return this._contentType;
  }

  get createdAt(): string | undefined {
    return this._createdAt;
  }

  get updatedAt(): string | undefined {
    return this._updatedAt;
  }

  toJSON() {
    return {
      id: this._id,
      tenantId: this._tenantId,
      name: this._name,
      description: this._description,
      language: this._language,
      siteUrl: this._siteUrl,
      industry: this._industry,
      targetAudience: this._targetAudience,
      contentType: this._contentType,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
