import type { ComponentDefinition } from '@casys/core';
import type {
  ComponentIndexingGlobal,
  ComponentIndexingResult,
  ComponentIndexingTenant,
} from '../../services/component-indexing.service';

export interface IndexComponentsCommandDTO {
  components: ComponentDefinition[];
  tenantId?: string;
  projectId?: string;
}

export interface ComponentIndexingUpsertPort {
  indexComponents(input: IndexComponentsCommandDTO): Promise<ComponentIndexingResult>;
  indexBaseCatalog(): Promise<ComponentIndexingGlobal>;
  indexTenantCatalog(tenantId: string): Promise<ComponentIndexingTenant>;
}

export type IComponentIndexingUpsertPort = ComponentIndexingUpsertPort;
