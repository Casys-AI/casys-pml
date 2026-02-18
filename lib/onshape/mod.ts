/**
 * MCP Onshape Library
 *
 * MCP tools for Onshape CAD/PDM operations via the Onshape REST API.
 * Zero external dependencies — custom HTTP client using fetch() + Web Crypto API.
 *
 * Tools available (~100):
 *   Documents:      document_list/get/create/delete/search/share
 *   Versions:       version_list/get/create, workspace_list/create/delete/merge
 *   Part Studios:   features, mass_properties, bounding_boxes, eval_featurescript
 *   Parts:          list, body_details, mass_properties, faces, bend_table
 *   Assemblies:     definition, bom, mass_properties, instances, mates, features
 *   Drawings:       create, views, geometry, modify, export
 *   Export/Import:  STEP, STL, glTF, OBJ, SOLIDWORKS, Parasolid, generic
 *   Configurations: get/update, variables get/set
 *   Metadata:       element/part get/update, full assembly metadata
 *   Releases:       create/get/update, revisions list/history
 *   Thumbnails:     document/element thumbnails
 *   Comments:       create/list/resolve/delete
 *   Users/Teams:    session info, team members
 *   Webhooks:       create/list/delete
 *
 * Usage:
 *   import { OnshapeToolsClient } from "@casys/mcp-onshape";
 *
 *   const client = new OnshapeToolsClient();
 *   const result = await client.execute("onshape_document_list", { limit: 10 });
 *
 * @module lib/onshape
 */

// Re-export client and tools
export {
  defaultClient,
  OnshapeToolsClient,
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./src/client.ts";

export type {
  OnshapeTool,
  OnshapeToolCategory,
  OnshapeToolsClientOptions,
  JSONSchema,
  MCPToolWireFormat,
} from "./src/client.ts";

// Re-export Onshape client (for direct use or DI in tests)
export {
  OnshapeClient,
  OnshapeAPIError,
  getOnshapeClient,
  setOnshapeClient,
} from "./src/api/onshape-client.ts";

export type { OnshapeClientConfig } from "./src/api/onshape-client.ts";
