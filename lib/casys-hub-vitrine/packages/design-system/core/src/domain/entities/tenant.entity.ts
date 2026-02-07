/**
 * Entité Tenant (multi-tenant)
 * Représente un locataire/organisation dans le système
 */
export interface TenantProps {
  id: string;
  name?: string;
  createdAt?: string;
  config?: Record<string, unknown>;
}

export class Tenant {
  private constructor(
    private readonly _id: string,
    private readonly _name?: string,
    private readonly _createdAt?: string,
    private readonly _config?: Record<string, unknown>
  ) {}

  static create(props: TenantProps): Tenant {
    const id = String(props.id ?? '').trim();
    if (!id) throw new Error('Tenant: id requis');

    return new Tenant(
      id,
      props.name?.trim(),
      props.createdAt,
      props.config
    );
  }

  get id(): string {
    return this._id;
  }

  get name(): string | undefined {
    return this._name;
  }

  get createdAt(): string | undefined {
    return this._createdAt;
  }

  get config(): Record<string, unknown> | undefined {
    return this._config;
  }

  toJSON() {
    return {
      id: this._id,
      name: this._name,
      createdAt: this._createdAt,
      config: this._config,
    };
  }
}
