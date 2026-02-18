# @casys/mcp-onshape

MCP server for [Onshape](https://www.onshape.com) CAD/PDM — **100 tools** across **14 categories**.

Connect any MCP-compatible AI agent (Claude Desktop, PML, custom) to your Onshape account via the standard [Model Context Protocol](https://modelcontextprotocol.io).

## Quick Start

### Prerequisites — Get API Keys

1. Go to [https://dev-portal.onshape.com](https://dev-portal.onshape.com)
2. Sign in with your Onshape account
3. Click **API Keys** in the left menu
4. Click **Create new API key**
5. Check the OAuth scopes you need (read/write/delete for documents, parts, assemblies, etc.)
6. Copy the **Access Key** and **Secret Key**

> Onshape API keys use Basic Auth (dev) or HMAC-SHA256 (production). The client supports both.

### stdio mode (Claude Desktop / PML)

Add to your MCP config (e.g. `.pml.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "onshape": {
      "command": "deno",
      "args": ["run", "--allow-all", "lib/onshape/server.ts"],
      "env": {
        "ONSHAPE_ACCESS_KEY": "your-access-key",
        "ONSHAPE_SECRET_KEY": "your-secret-key"
      }
    }
  }
}
```

### HTTP mode

```bash
ONSHAPE_ACCESS_KEY=xxx \
ONSHAPE_SECRET_KEY=xxx \
deno run --allow-all server.ts --http --port=3013
```

### Category filtering

Load only the categories you need:

```bash
deno run --allow-all server.ts --categories=documents,parts,assemblies
```

## Tools (100)

### Documents (12)

| Tool | Description |
|------|-------------|
| `onshape_document_list` | List documents (owner, search filter, limit) |
| `onshape_document_get` | Get document by ID |
| `onshape_document_create` | Create new document |
| `onshape_document_delete` | Delete document |
| `onshape_document_update` | Update name/description |
| `onshape_document_elements` | List elements in workspace |
| `onshape_document_history` | Get document change history |
| `onshape_document_share` | Share with users (email + permission) |
| `onshape_document_unshare` | Remove sharing |
| `onshape_document_search` | Full-text search across documents |
| `onshape_document_permissions` | Get document ACL |
| `onshape_document_units` | Get workspace default units |

### Versions & Workspaces (8)

| Tool | Description |
|------|-------------|
| `onshape_version_create` | Create version (snapshot) |
| `onshape_version_list` | List all versions |
| `onshape_version_get` | Get version details |
| `onshape_workspace_create` | Create branch workspace |
| `onshape_workspace_list` | List all workspaces |
| `onshape_workspace_delete` | Delete workspace |
| `onshape_workspace_merge` | Merge workspace into version |
| `onshape_workspace_merge_preview` | Preview merge conflicts |

### Part Studios (14)

| Tool | Description |
|------|-------------|
| `onshape_partstudio_create` | Create new part studio |
| `onshape_partstudio_features` | List all features |
| `onshape_partstudio_add_feature` | Add a feature (JSON body) |
| `onshape_partstudio_update_feature` | Update existing feature |
| `onshape_partstudio_delete_feature` | Delete feature by ID |
| `onshape_partstudio_body_details` | Get body topology |
| `onshape_partstudio_mass_properties` | Mass, volume, density, CoG |
| `onshape_partstudio_bounding_boxes` | Axis-aligned bounding boxes |
| `onshape_partstudio_shaded_views` | Render shaded PNG views |
| `onshape_partstudio_named_views` | Get named camera views |
| `onshape_partstudio_eval_featurescript` | Execute FeatureScript code |
| `onshape_partstudio_compare` | Diff between versions/workspaces |
| `onshape_partstudio_rollback` | Rollback to feature index |
| `onshape_partstudio_feature_specs` | Get feature type specifications |

### Parts (7)

| Tool | Description |
|------|-------------|
| `onshape_parts_list` | List parts in element |
| `onshape_part_body_details` | Body topology for a part |
| `onshape_part_mass_properties` | Mass properties for a part |
| `onshape_part_bounding_boxes` | Bounding box for a part |
| `onshape_part_shaded_views` | Render part as PNG |
| `onshape_part_bend_table` | Sheet metal bend table |
| `onshape_part_faces` | List part faces |

### Assemblies (14)

| Tool | Description |
|------|-------------|
| `onshape_assembly_create` | Create new assembly |
| `onshape_assembly_definition` | Full assembly tree (instances, mates) |
| `onshape_assembly_modify` | Modify assembly (raw JSON) |
| `onshape_assembly_insert_instance` | Insert part/sub-assembly |
| `onshape_assembly_delete_instance` | Remove instance |
| `onshape_assembly_add_feature` | Add assembly feature (mate, pattern) |
| `onshape_assembly_features` | List assembly features |
| `onshape_assembly_bom` | Bill of materials |
| `onshape_assembly_mass_properties` | Assembly mass/CoG |
| `onshape_assembly_bounding_boxes` | Assembly bounding box |
| `onshape_assembly_mate_values` | Get current mate values |
| `onshape_assembly_update_mates` | Update mate positions |
| `onshape_assembly_shaded_views` | Render assembly as PNG |
| `onshape_assembly_exploded_views` | Get exploded view configs |

### Drawings (5)

| Tool | Description |
|------|-------------|
| `onshape_drawing_create` | Create drawing from body |
| `onshape_drawing_views` | List drawing views |
| `onshape_drawing_geometry` | Get view geometry |
| `onshape_drawing_modify` | Modify drawing (raw JSON) |
| `onshape_drawing_export` | Export as PDF/DXF/DWG |

### Export & Import (10)

| Tool | Description |
|------|-------------|
| `onshape_export_step` | Export as STEP |
| `onshape_export_stl` | Export as STL |
| `onshape_export_gltf` | Export as glTF |
| `onshape_export_obj` | Export as OBJ |
| `onshape_export_solidworks` | Export as SOLIDWORKS |
| `onshape_export_parasolid` | Export as Parasolid |
| `onshape_export_generic` | Export any format by name |
| `onshape_import_file` | Import CAD file |
| `onshape_translation_status` | Poll export/import progress |
| `onshape_translator_formats` | List available format names |

### Configurations & Variables (6)

| Tool | Description |
|------|-------------|
| `onshape_config_get` | Get element configuration |
| `onshape_config_update` | Update config parameters |
| `onshape_config_encode` | Encode config string for URLs |
| `onshape_variables_get` | Get variable studio values |
| `onshape_variables_set` | Set variable values |
| `onshape_variable_studio_create` | Create variable studio element |

### Metadata (5)

| Tool | Description |
|------|-------------|
| `onshape_metadata_element` | Get element metadata properties |
| `onshape_metadata_part` | Get part metadata properties |
| `onshape_metadata_assembly_full` | Get full assembly metadata tree |
| `onshape_metadata_update_element` | Update element metadata |
| `onshape_metadata_update_part` | Update part metadata |

### Releases & Revisions (6)

| Tool | Description |
|------|-------------|
| `onshape_release_create` | Create release package |
| `onshape_release_get` | Get release details |
| `onshape_release_update` | Update release properties |
| `onshape_revision_list` | List revisions for company |
| `onshape_revision_by_part_number` | Get latest revision by part# |
| `onshape_revision_history` | Full revision history for part# |

### Thumbnails (3)

| Tool | Description |
|------|-------------|
| `onshape_thumbnail_document` | Get document thumbnail URL |
| `onshape_thumbnail_element` | Get element thumbnail URL |
| `onshape_thumbnail_element_config` | Get configured element thumbnail |

### Comments (4)

| Tool | Description |
|------|-------------|
| `onshape_comment_create` | Create comment on document |
| `onshape_comment_list` | List comments on document |
| `onshape_comment_resolve` | Resolve/unresolve comment |
| `onshape_comment_delete` | Delete comment |

### Users & Teams (3)

| Tool | Description |
|------|-------------|
| `onshape_user_session_info` | Get current user session |
| `onshape_team_get` | Get team details |
| `onshape_team_members` | List team members |

### Webhooks (3)

| Tool | Description |
|------|-------------|
| `onshape_webhook_create` | Create webhook subscription |
| `onshape_webhook_list` | List active webhooks |
| `onshape_webhook_delete` | Delete webhook |

## Onshape ID System

Onshape uses 24-character hex IDs. Every API call needs a combination of:

| ID | Abbreviation | Description |
|----|-------------|-------------|
| Document ID | `did` | Top-level container |
| Workspace ID | `wid` | Mutable branch (editable) |
| Version ID | `vid` | Immutable snapshot |
| Element ID | `eid` | Part Studio, Assembly, Drawing, etc. |
| Part ID | `pid` | Individual part within element |

**WVM pattern**: Most tools accept `wvm_type` ("w"/"v"/"m") + `wvm_id` to specify which workspace/version/microversion to target.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONSHAPE_ACCESS_KEY` | Yes | API Access Key from dev portal |
| `ONSHAPE_SECRET_KEY` | Yes | API Secret Key from dev portal |
| `ONSHAPE_URL` | No | Base URL (default: `https://cad.onshape.com`) |
| `ONSHAPE_AUTH_METHOD` | No | `basic` (default) or `hmac` |

## Architecture

```
mod.ts              # Public API
server.ts           # MCP server (stdio + HTTP, port 3013)
deno.json           # Package config
src/
  api/
    onshape-client.ts  # REST client (Basic + HMAC-SHA256 auth)
    types.ts           # API response types
  tools/
    documents.ts       # 12 document tools
    versions.ts        # 8 version/workspace tools
    partstudios.ts     # 14 part studio tools
    parts.ts           # 7 part tools
    assemblies.ts      # 14 assembly tools
    drawings.ts        # 5 drawing tools
    exports.ts         # 10 export/import tools
    configurations.ts  # 6 config/variable tools
    metadata.ts        # 5 metadata tools
    releases.ts        # 6 release/revision tools
    thumbnails.ts      # 3 thumbnail tools
    comments.ts        # 4 comment tools
    users.ts           # 3 user/team tools
    webhooks.ts        # 3 webhook tools
    mod.ts             # Registry
    types.ts           # Tool interface
  client.ts            # OnshapeToolsClient
tests/
```

## Development

```bash
# Type check
deno check mod.ts server.ts

# Run tests
deno test --allow-all tests/

# Start HTTP server (dev)
deno task serve
```

## License

MIT
