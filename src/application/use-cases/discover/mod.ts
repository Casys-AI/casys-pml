/**
 * Discover Use Cases Module
 *
 * Use cases for tool and capability discovery.
 *
 * @module application/use-cases/discover
 */

// Core discover use cases
export { DiscoverToolsUseCase, type DiscoverToolsDeps, type DiscoverToolsRequest } from "./discover-tools.ts";
export {
  DiscoverCapabilitiesUseCase,
  type DiscoverCapabilitiesDeps,
  type DiscoverCapabilitiesRequest,
  type ScopeFilterFn,
} from "./discover-capabilities.ts";

// Extended discover use cases (MCP Tools Consolidation)
export { ListCapabilitiesUseCase, type ListCapabilitiesDeps, globToSqlLike } from "./list-capabilities.ts";
export { LookupUseCase, type LookupDeps } from "./lookup.ts";
export { GetDetailsUseCase, type GetDetailsDeps } from "./get-details.ts";

// Scope filtering helpers
export {
  filterCapabilityIdsByScope,
  filterCapabilityRecordIdsByScope,
  canUserMutateCapability,
} from "./scope-filter.ts";

// Types - core
export type {
  DiscoverRequest,
  DiscoveredCapability,
  DiscoveredTool,
  DiscoverCapabilitiesResult,
  DiscoverToolsResult,
} from "./types.ts";

// Types - extended (MCP Tools Consolidation)
export type {
  Scope,
  ListCapabilitiesRequest,
  ListCapabilitiesResult,
  ListCapabilityItem,
  LookupRequest,
  LookupResult,
  GetDetailsRequest,
  GetDetailsResult,
  CapabilityDetails,
  ToolDetails,
} from "./types.ts";
