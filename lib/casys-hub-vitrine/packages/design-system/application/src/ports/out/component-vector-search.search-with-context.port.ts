import type { ComponentDefinition } from '@casys/core';

export interface ComponentVectorSearchReadPort {
  searchComponentsWithContext(
    query: string
  ): Promise<{ id: string; score: number; metadata: Partial<ComponentDefinition> }[]>;
}

export type IComponentVectorSearchReadPort = ComponentVectorSearchReadPort;
