---
title: 'Config Permission HIL'
slug: 'config-permission-hil'
created: '2026-01-27'
status: 'draft'
stepsCompleted: [1, 2, 3]
epic: 'epic-mcp-config-aware'
sequence: 3
depends_on: ['02-tech-spec-config-aware-discovery']
tech_stack:
  - Deno/TypeScript
  - PML Package (HIL workflow)
  - MCP stdio/http protocol
files_to_modify:
  - packages/pml/src/workflow/pending-store.ts
  - packages/pml/src/cli/shared/approval-formatter.ts
  - packages/pml/src/cli/stdio-command.ts
  - packages/pml/src/cli/serve-command.ts
  - packages/pml/src/loader/types.ts
  - packages/pml/src/types.ts
code_patterns:
  - ApprovalType enum extension
  - PendingWorkflow state management
  - formatApprovalRequired() pattern
  - HIL continuation flow
test_patterns:
  - Unit tests for approval formatting
  - Integration tests for full HIL flow
---

# Tech-Spec 03: Config Permission HIL

**Epic:** MCP Config-Aware System
**Sequence:** 3 of 3
**Depends on:** [02-tech-spec-config-aware-discovery](./02-tech-spec-config-aware-discovery.md)

**Created:** 2026-01-27

## Overview

### Problem Statement

**Contexte:** Spec 02 ajoute `configIncompatibility` à `SuggestionResult` quand le meilleur chemin est filtré pour raison de config.

**Problème:**

1. **Pas de mécanisme pour réagir:** Quand `configIncompatibility` est présent, Claude ne sait pas quoi faire.
2. **Pas de HIL pour changement de config:** L'utilisateur ne peut pas approuver un changement de config MCP.
3. **Pas d'application du changement:** Même si approuvé, rien n'applique le changement.

### Solution

**Nouveau type d'approbation `config_permission`:**

```
DAGSuggesterAdapter.suggest() retourne configIncompatibility
        ↓
pml_execute détecte configIncompatibility
        ↓
Retourne approval_required: config_permission
        ↓
Claude présente le choix à l'utilisateur
        ↓
Si approuvé: continue_workflow → applyConfigChange()
        ↓
Re-exécute avec nouvelle config
```

**Changements clés:**

1. **Nouveau ApprovalType:** `config_permission` ajouté à l'enum
2. **Extension PendingWorkflow:** Stocker `configChange` (namespace, args suggérés)
3. **Nouveau handler:** `formatConfigPermissionApproval()`
4. **Continuation logic:** Appliquer le changement de config puis re-exécuter

### Scope

**In Scope:**
- Extension `ApprovalType` avec `config_permission`
- Extension `PendingWorkflow` avec `configChange`
- Handler approval dans `formatApprovalRequired()`
- Continuation logic dans `stdio-command.ts` et `serve-command.ts`
- Application du changement de config (update `.pml.json`)

**Out of Scope:**
- UI pour éditer la config (fichier JSON seulement)
- Rollback automatique si changement échoue
- Multi-config approval (un seul changement à la fois)

## Context for Development

### Codebase Patterns

**1. ApprovalType Pattern**
```typescript
// packages/pml/src/workflow/pending-store.ts:26
export type ApprovalType = "tool_permission" | "dependency" | "api_key_required" | "integrity";
// → Ajouter: | "config_permission"
```

**2. PendingWorkflow Pattern**
```typescript
// packages/pml/src/workflow/pending-store.ts:47-77
export interface PendingWorkflow {
  code: string;
  toolId: string;
  approvalType: ApprovalType;
  // ... autres champs
  // → Ajouter:
  configChange?: {
    namespace: string;
    currentArgs: string[];
    suggestedArgs: string[];
  };
}
```

**3. formatApprovalRequired Pattern**
```typescript
// packages/pml/src/cli/shared/approval-formatter.ts
if (approvalResult.approvalType === "tool_permission") {
  // Format response
  return { content: [{ type: "text", text: JSON.stringify({...}) }] };
}
// → Ajouter: if (approvalResult.approvalType === "config_permission") {...}
```

**4. Continuation Pattern**
```typescript
// packages/pml/src/cli/serve-command.ts:239-243
if (pending.approvalType === "tool_permission" && loader && pending.toolId) {
  loader.approveToolForSession(pending.toolId);
} else if (pending.approvalType === "api_key_required") {
  await reloadEnv(workspace);
}
// → Ajouter: else if (pending.approvalType === "config_permission") {...}
```

### Files to Reference

| File | Purpose | Key Code |
| ---- | ------- | -------- |
| `packages/pml/src/workflow/pending-store.ts` | Types & store | `ApprovalType`, `PendingWorkflow` |
| `packages/pml/src/cli/shared/approval-formatter.ts` | Format responses | `formatApprovalRequired()` |
| `packages/pml/src/cli/stdio-command.ts` | stdio continuation | lignes 224-256 |
| `packages/pml/src/cli/serve-command.ts` | HTTP continuation | lignes 224-269 |
| `packages/pml/src/loader/types.ts` | Loader types | `ApprovalRequiredResult` |
| `src/domain/interfaces/dag-suggester.ts` | Spec 02 types | `ConfigIncompatibility` |

### Technical Decisions

**TD-001: Update `.pml.json` directement**
- **Décision:** Écrire le changement de config dans `.pml.json`
- **Raison:** Source of truth pour la config MCP
- **Note:** Backup avant modification

**TD-002: Re-spawn MCP après changement**
- **Décision:** Shutdown + re-spawn le MCP concerné après changement de config
- **Raison:** Les args sont passés au spawn, pas modifiables à chaud

**TD-003: Un seul changement à la fois**
- **Décision:** Un seul `config_permission` approval par workflow
- **Raison:** Simplifier le flow, éviter les conflits

**TD-004: Options: continue, abort, edit-manually**
- **Décision:** Trois options pour l'utilisateur
- **Raison:** `edit-manually` permet de personnaliser avant d'approuver

## Implementation Plan

### Tasks

#### Phase 1: Types

- [ ] **Task 1: Add config_permission to ApprovalType**
  - File: `packages/pml/src/workflow/pending-store.ts`
  - Code:
    ```typescript
    export type ApprovalType =
      | "tool_permission"
      | "dependency"
      | "api_key_required"
      | "integrity"
      | "config_permission";  // NEW
    ```

- [ ] **Task 2: Add configChange to PendingWorkflow**
  - File: `packages/pml/src/workflow/pending-store.ts`
  - Code:
    ```typescript
    export interface PendingWorkflow {
      // ... existing fields
      /** Config change info (for "config_permission" approvals) */
      configChange?: {
        namespace: string;
        currentArgs: string[];
        suggestedArgs: string[];
      };
    }
    ```

- [ ] **Task 2b: Update setWithId options type**
  - File: `packages/pml/src/workflow/pending-store.ts`
  - Action: Ajouter `configChange` aux options de `setWithId()` et `create()`
  - Code:
    ```typescript
    // Dans setWithId() options parameter (ligne ~179):
    options?: {
      namespace?: string;
      needsInstallation?: boolean;
      dependency?: McpDependency;
      missingKeys?: string[];
      integrityInfo?: { fqdnBase: string; newHash: string; oldHash: string };
      fqdnMap?: Record<string, string>;
      dagTasks?: PendingDAGTask[];
      configChange?: {  // NEW
        namespace: string;
        currentArgs: string[];
        suggestedArgs: string[];
      };
    }

    // Dans le corps de setWithId(), ajouter:
    this.workflows.set(id, {
      // ... existing fields
      configChange: options?.configChange,  // NEW
    });
    ```

- [ ] **Task 3: Add ConfigPermissionApprovalRequired type**
  - File: `packages/pml/src/loader/types.ts`
  - Code:
    ```typescript
    export interface ConfigPermissionApprovalRequired {
      approvalRequired: true;
      approvalType: "config_permission";
      workflowId: string;
      description: string;
      configChange: {
        namespace: string;
        currentArgs: string[];
        suggestedArgs: string[];
      };
      /** The filtered path that would have been best */
      filteredPath: string[];
      /** The alternative path being used instead */
      alternativePath?: string[];
    }
    ```

#### Phase 2: Detection & Formatting

- [ ] **Task 4: Detect configIncompatibility in pml_execute**
  - File: `packages/pml/src/cli/shared/local-executor.ts` ou équivalent
  - Action: Quand suggestion a `configIncompatibility`, créer approval
  - Code:
    ```typescript
    // After getting suggestion from DAGSuggesterAdapter
    if (suggestion.configIncompatibility) {
      return {
        status: "approval_required",
        approval: {
          approvalRequired: true,
          approvalType: "config_permission",
          workflowId: crypto.randomUUID(),
          description: `Tool ${suggestion.configIncompatibility.incompatibleTools[0]} requires config change`,
          configChange: suggestion.configIncompatibility.suggestedConfig,
          filteredPath: suggestion.configIncompatibility.filteredPath,
        },
        toolId: suggestion.configIncompatibility.incompatibleTools[0],
      };
    }
    ```

- [ ] **Task 5: Add config_permission handler in formatApprovalRequired**
  - File: `packages/pml/src/cli/shared/approval-formatter.ts`
  - Code:
    ```typescript
    // Handle config permission approval
    if (approvalResult.approvalType === "config_permission") {
      const workflowId = approvalResult.workflowId;

      if (originalCode) {
        pendingStore.setWithId(workflowId, originalCode, toolName, "config_permission", {
          configChange: approvalResult.configChange,
          fqdnMap,
          dagTasks,
        });
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "approval_required",
            approval_type: "config_permission",
            workflow_id: workflowId,
            description: approvalResult.description,
            context: {
              tool: toolName,
              namespace: approvalResult.configChange.namespace,
              current_args: approvalResult.configChange.currentArgs,
              suggested_args: approvalResult.configChange.suggestedArgs,
              filtered_path: approvalResult.filteredPath,
              alternative_path: approvalResult.alternativePath,
            },
            instruction: `To use ${toolName}, the MCP server "${approvalResult.configChange.namespace}" needs different arguments.`,
            options: ["continue", "abort", "edit-manually"],
          }, null, 2),
        }],
      };
    }
    ```

#### Phase 3: Continuation Logic

- [ ] **Task 6: Create applyConfigChange function**
  - File: `packages/pml/src/config/apply-config-change.ts` (nouveau)
  - Code:
    ```typescript
    import { loadPmlConfig, savePmlConfig } from "../init/mod.ts";

    export interface ConfigChangeResult {
      success: boolean;
      error?: string;
      backupPath?: string;
    }

    export async function applyConfigChange(
      workspace: string,
      configChange: {
        namespace: string;
        currentArgs: string[];
        suggestedArgs: string[];
      },
    ): Promise<ConfigChangeResult> {
      try {
        // 1. Load current config
        const config = await loadPmlConfig(workspace);

        // 2. Backup
        const backupPath = `${workspace}/.pml.json.backup.${Date.now()}`;
        await Deno.copyFile(`${workspace}/.pml.json`, backupPath);

        // 3. Update args for the namespace
        if (config.mcpServers?.[configChange.namespace]) {
          config.mcpServers[configChange.namespace].args = configChange.suggestedArgs;
        } else {
          return {
            success: false,
            error: `MCP server "${configChange.namespace}" not found in config`,
          };
        }

        // 4. Save updated config
        await savePmlConfig(workspace, config);

        return { success: true, backupPath };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    ```

- [ ] **Task 7: Add config_permission continuation in stdio-command.ts**
  - File: `packages/pml/src/cli/stdio-command.ts`
  - **Pattern:** Suivre le pattern existant (lignes 224-284 serve-command.ts)
  - Code:
    ```typescript
    // In continuation handling section (after checking approved)
    // PRE-ACTIONS par type:
    if (pending.approvalType === "tool_permission" && loader && pending.toolId) {
      loader.approveToolForSession(pending.toolId);
    } else if (pending.approvalType === "api_key_required") {
      await reloadEnv(workspace);
    } else if (pending.approvalType === "config_permission" && pending.configChange) {
      // 1. Apply config change to .pml.json
      const configResult = await applyConfigChange(workspace, pending.configChange);
      if (!configResult.success) {
        pendingWorkflowStore.delete(continueWorkflow.workflowId);
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{
              type: "text",
              text: JSON.stringify({
                status: "error",
                error: `Failed to apply config change: ${configResult.error}`,
              }),
            }],
          },
        });
      }
      log(`Config backup: ${configResult.backupPath}`);

      // 2. Shutdown old MCP
      if (stdioManager) {
        stdioManager.shutdown(pending.configChange.namespace);
      }

      // 3. Re-spawn MCP with new args (lazy on next call)
      // 4. Re-discover tools from this MCP
      const mcpConfig = loadMcpServers(await loadPmlConfig(workspace));
      const serverConfig = mcpConfig.get(pending.configChange.namespace);
      if (serverConfig && stdioManager) {
        const discovery = await discoverMcpTools(
          pending.configChange.namespace,
          serverConfig,
          stdioManager,
        );

        // 5. Re-sync to server
        if (discovery.tools.length > 0) {
          await syncDiscoveredTools(cloudUrl, apiKey, [discovery]);
          log(`Re-synced ${discovery.tools.length} tools for ${pending.configChange.namespace}`);
        }
      }

      log(`Applied config change for ${pending.configChange.namespace}`);
    }

    // Then re-execute the code (existing pattern)
    const result = await executeLocalCode(pending.code, ...);
    ```

- [ ] **Task 8: Add config_permission continuation in serve-command.ts**
  - File: `packages/pml/src/cli/serve-command.ts`
  - Action: Same logic as Task 7 but for HTTP server
  - **Important:** Même flow en 5 étapes:
    1. `applyConfigChange()` → backup + update `.pml.json`
    2. `stdioManager.shutdown()` → arrête l'ancien MCP
    3. Re-spawn (lazy)
    4. `discoverMcpTools()` → `tools/list`
    5. `syncDiscoveredTools()` → POST /api/tools/sync

#### Phase 4: Integration

- [ ] **Task 9: Update AnyApprovalResult type**
  - File: `packages/pml/src/cli/shared/types.ts`
  - Code:
    ```typescript
    export type AnyApprovalResult =
      | ToolPermissionApprovalRequired
      | ApiKeyApprovalRequired
      | IntegrityApprovalRequired
      | DependencyApprovalRequired
      | ConfigPermissionApprovalRequired;  // NEW
    ```

- [ ] **Task 10: Export types from mod.ts**
  - File: `packages/pml/src/workflow/mod.ts`
  - Action: Export new types

#### Phase 5: Tests

- [ ] **Task 11: Unit tests for applyConfigChange**
- [ ] **Task 12: Unit tests for config_permission formatting**
- [ ] **Task 13: Integration test for full HIL flow**

### Acceptance Criteria

#### Approval Detection

- [ ] **AC-1:** Given `configIncompatibility` in suggestion result, when pml_execute runs, then `approval_required: config_permission` is returned.

- [ ] **AC-2:** Given `config_permission` approval, when formatted, then response includes `namespace`, `current_args`, `suggested_args`, and `filtered_path`.

#### Continuation

- [ ] **AC-3:** Given `config_permission` approval and user approves, when continue_workflow received, then `.pml.json` is updated with new args.

- [ ] **AC-4:** Given `.pml.json` update, when config applied, then backup file is created before modification.

- [ ] **AC-5:** Given config applied, when MCP re-spawned, then new args are used.

- [ ] **AC-5b:** Given MCP re-spawned, when tools/list called, then tools are re-synced to server via POST /api/tools/sync.

#### Error Handling

- [ ] **AC-6:** Given MCP namespace not found in config, when applyConfigChange called, then error returned (not crash).

- [ ] **AC-7:** Given user selects "abort", when continue_workflow received with `approved: false`, then workflow aborted and no config changed.

- [ ] **AC-8:** Given user selects "edit-manually", when instruction displayed, then user is guided to edit `.pml.json` manually.

## Additional Context

### Dependencies

**Requires:**
- **Spec 02: Config-Aware Discovery** — fournit `configIncompatibility` dans `SuggestionResult`
- **Spec 01: MCP Config Sync** — fournit `mcpServers` dans `.pml.json`

### Testing Strategy

**Unit Tests:**
- `applyConfigChange()` avec différents cas (success, namespace not found, write error)
- `formatApprovalRequired()` avec `config_permission` type
- Continuation handling logic

**Integration Tests:**
- Full flow: suggestion → approval → continue → config applied → re-execute

**Manual Testing:**
1. Configurer un MCP avec args restrictifs
2. Demander un outil filtré par ces args
3. Vérifier que `config_permission` est proposé
4. Approuver et vérifier que `.pml.json` est mis à jour
5. Vérifier que le MCP est re-spawné avec les nouveaux args

### Notes

**Message pour l'utilisateur:**
```
⚠️ Config Change Required

The tool "filesystem:write_file" is not available with current MCP config.

Current args: ["--read-only"]
Suggested args: []

This will update your .pml.json and restart the "filesystem" MCP server.

[Continue] [Abort] [Edit Manually]
```

**Risques:**
1. **Config corruption** — mitigé par backup avant modification
2. **MCP ne redémarre pas** — fail-fast, user doit intervenir
3. **Conflits si config éditée manuellement** — prendre la version fichier comme source of truth

**Questions ouvertes:**
- Faut-il un mécanisme de rollback automatique si le MCP ne redémarre pas?
- Faut-il supporter plusieurs changements de config dans un seul workflow?
