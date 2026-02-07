import type { ComponentUsage } from '@casys/core';

export interface CreateComponentUsageCommandDTO {
  componentId: string;
  textFragmentId: string;
  position: number;
  props: Record<string, unknown>;
  tenantId?: string;
}

export interface CreateComponentUsageResultDTO {
  success: boolean;
  usage?: ComponentUsage;
  error?: string;
}

export interface ComponentUsageCreatePort {
  createComponentUsage(
    input: CreateComponentUsageCommandDTO
  ): Promise<CreateComponentUsageResultDTO>;
}

export type IComponentUsageCreatePort = ComponentUsageCreatePort;
