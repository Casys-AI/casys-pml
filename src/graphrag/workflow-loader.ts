/**
 * Workflow Templates Loader (Story 5.2)
 *
 * Loads and validates workflow patterns from YAML files.
 * Supports graph bootstrap and user-defined tool sequences.
 *
 * @module graphrag/workflow-loader
 */

import * as log from "@std/log";
import { parse as parseYaml } from "@std/yaml";

// =============================================================================
// Types (Story 5.2 AC #1)
// =============================================================================

/**
 * Single workflow template definition
 *
 * Supports two formats:
 * 1. `steps` - Simple linear sequence: [A, B, C] → edges (A→B), (B→C)
 * 2. `edges` - Explicit DAG: [[A,B], [A,C], [B,D], [C,D]] for parallel patterns
 *
 * Use `steps` for simple workflows, `edges` for complex DAGs with branching.
 * Cannot use both in the same workflow.
 */
export interface WorkflowTemplate {
  /** Workflow name (e.g., "parse_file", "web_research") */
  name: string;
  /** Tool sequence (linear) - minimum 2 tools. Mutually exclusive with `edges`. */
  steps?: string[];
  /** Explicit edges (DAG) - minimum 1 edge. Mutually exclusive with `steps`. */
  edges?: [string, string][];
}

/**
 * YAML file structure for workflow templates
 */
export interface WorkflowTemplatesFile {
  workflows: WorkflowTemplate[];
}

/**
 * Validation result for a single workflow
 */
export interface ValidationResult {
  valid: boolean;
  workflow: WorkflowTemplate;
  errors: string[];
  warnings: string[];
}

/**
 * Edge representation from workflow steps
 */
export interface WorkflowEdge {
  from: string;
  to: string;
  workflowName: string;
}

// =============================================================================
// Validation Types and Helpers
// =============================================================================

/**
 * Tool validation result
 */
interface ToolValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a tool ID string
 */
function validateToolId(
  toolId: unknown,
  context: string,
  workflowName: string,
  knownTools: Set<string>,
): ToolValidationResult {
  if (!toolId || typeof toolId !== "string") {
    return {
      valid: false,
      error: `${context} in workflow '${workflowName}' is not a valid string`,
    };
  }

  if (knownTools.size > 0 && !knownTools.has(toolId)) {
    return {
      valid: false,
      error: `Unknown tool ID '${toolId}' in workflow '${workflowName}'. Tool must exist in tool_schema.`,
    };
  }

  return { valid: true };
}

// =============================================================================
// WorkflowLoader Class
// =============================================================================

/**
 * Workflow Templates Loader
 *
 * Loads workflow patterns from YAML files and converts them to graph edges.
 * Validates format and logs warnings for unknown tools (AC #5).
 */
export class WorkflowLoader {
  /** Known tool IDs for validation (optional) */
  private knownTools: Set<string> = new Set();

  /**
   * Set known tools for validation
   *
   * @param toolIds - Array of known tool IDs
   */
  setKnownTools(toolIds: string[]): void {
    this.knownTools = new Set(toolIds);
  }

  /**
   * Load workflow templates from YAML file (AC #1)
   *
   * @param path - Path to YAML file
   * @returns Parsed workflows array
   * @throws Error if file cannot be read or parsed
   */
  async loadFromYaml(path: string): Promise<WorkflowTemplate[]> {
    log.info(`[WorkflowLoader] Loading templates from: ${path}`);

    try {
      const content = await Deno.readTextFile(path);
      const parsed = parseYaml(content) as WorkflowTemplatesFile;

      if (!parsed || !parsed.workflows || !Array.isArray(parsed.workflows)) {
        throw new Error("Invalid YAML format: missing 'workflows' array");
      }

      log.info(`[WorkflowLoader] Loaded ${parsed.workflows.length} workflow templates`);
      return parsed.workflows;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        log.warn(`[WorkflowLoader] File not found: ${path}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Validate workflow templates (AC #1, #5)
   *
   * Validates:
   * - Each workflow has a name
   * - Each workflow has EITHER steps OR edges (not both, not neither)
   * - steps: at least 2 tools (AC #1)
   * - edges: at least 1 edge, each edge is [from, to]
   * - Logs warnings for unknown tool IDs (AC #5 - don't fail)
   *
   * @param workflows - Array of workflows to validate
   * @returns Array of validation results
   */
  validate(workflows: WorkflowTemplate[]): ValidationResult[] {
    const results: ValidationResult[] = [];

    for (const workflow of workflows) {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Validate name
      if (!workflow.name || typeof workflow.name !== "string") {
        errors.push("Workflow missing required 'name' field");
      }

      const hasSteps = workflow.steps && Array.isArray(workflow.steps);
      const hasEdges = workflow.edges && Array.isArray(workflow.edges);

      // Must have either steps or edges, not both, not neither
      if (hasSteps && hasEdges) {
        errors.push(
          `Workflow '${workflow.name}' has both 'steps' and 'edges' - use one or the other`,
        );
      } else if (!hasSteps && !hasEdges) {
        errors.push(`Workflow '${workflow.name}' missing 'steps' or 'edges' array`);
      } else if (hasSteps) {
        // Validate steps format
        this.validateSteps(workflow, errors, warnings);
      } else if (hasEdges) {
        // Validate edges format
        this.validateEdges(workflow, errors, warnings);
      }

      results.push({
        valid: errors.length === 0,
        workflow,
        errors,
        warnings,
      });
    }

    // Log all warnings (AC #5)
    for (const result of results) {
      for (const warning of result.warnings) {
        log.warn(`[WorkflowLoader] ${warning}`);
      }
    }

    return results;
  }

  /**
   * Validate steps format (linear sequence)
   */
  private validateSteps(
    workflow: WorkflowTemplate,
    errors: string[],
    _warnings: string[],
  ): void {
    const steps = workflow.steps!;

    // Validate minimum 2 steps (AC #1)
    if (steps.length < 2) {
      errors.push(
        `Workflow '${workflow.name}' has ${steps.length} steps, minimum is 2`,
      );
    }

    // Validate step strings
    for (let i = 0; i < steps.length; i++) {
      const result = validateToolId(
        steps[i],
        `Step ${i}`,
        workflow.name,
        this.knownTools,
      );
      if (!result.valid && result.error) {
        errors.push(result.error);
      }
    }
  }

  /**
   * Validate edges format (explicit DAG)
   */
  private validateEdges(
    workflow: WorkflowTemplate,
    errors: string[],
    _warnings: string[],
  ): void {
    const edges = workflow.edges!;

    // Validate minimum 1 edge
    if (edges.length < 1) {
      errors.push(`Workflow '${workflow.name}' has no edges, minimum is 1`);
    }

    // Validate each edge is [from, to]
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      if (!Array.isArray(edge) || edge.length !== 2) {
        errors.push(`Edge ${i} in workflow '${workflow.name}' must be [from, to] array`);
        continue;
      }

      const [from, to] = edge;

      const fromResult = validateToolId(
        from,
        `Edge ${i} 'from'`,
        workflow.name,
        this.knownTools,
      );
      if (!fromResult.valid && fromResult.error) {
        errors.push(fromResult.error);
      }

      const toResult = validateToolId(
        to,
        `Edge ${i} 'to'`,
        workflow.name,
        this.knownTools,
      );
      if (!toResult.valid && toResult.error) {
        errors.push(toResult.error);
      }
    }
  }

  /**
   * Convert workflows to edges (Story 5.2)
   *
   * Supports two formats:
   * - steps: [A, B, C] → edges: (A→B), (B→C)
   * - edges: [[A,B], [A,C]] → edges: (A→B), (A→C)
   *
   * @param workflows - Array of valid workflows
   * @returns Array of edges ready for DB insertion
   */
  convertToEdges(workflows: WorkflowTemplate[]): WorkflowEdge[] {
    const edges: WorkflowEdge[] = [];

    for (const workflow of workflows) {
      if (workflow.steps && workflow.steps.length >= 2) {
        // Format 1: steps (linear sequence)
        for (let i = 0; i < workflow.steps.length - 1; i++) {
          const from = workflow.steps[i];
          const to = workflow.steps[i + 1];

          edges.push({
            from,
            to,
            workflowName: workflow.name,
          });
        }
      } else if (workflow.edges && workflow.edges.length >= 1) {
        // Format 2: edges (explicit DAG)
        for (const [from, to] of workflow.edges) {
          edges.push({
            from,
            to,
            workflowName: workflow.name,
          });
        }
      }
    }

    log.debug(`[WorkflowLoader] Converted ${workflows.length} workflows to ${edges.length} edges`);
    return edges;
  }

  /**
   * Load, validate, and convert in one call
   *
   * @param path - Path to YAML file
   * @returns Object with workflows, validation results, and edges
   */
  async loadAndProcess(path: string): Promise<{
    workflows: WorkflowTemplate[];
    validationResults: ValidationResult[];
    validWorkflows: WorkflowTemplate[];
    edges: WorkflowEdge[];
  }> {
    const workflows = await this.loadFromYaml(path);
    const validationResults = this.validate(workflows);

    const validWorkflows = validationResults
      .filter((r) => r.valid)
      .map((r) => r.workflow);

    const edges = this.convertToEdges(validWorkflows);

    // Log summary
    const invalidCount = validationResults.filter((r) => !r.valid).length;
    const warningCount = validationResults.reduce((sum, r) => sum + r.warnings.length, 0);

    log.info(
      `[WorkflowLoader] Processed ${workflows.length} workflows: ${validWorkflows.length} valid, ${invalidCount} invalid, ${warningCount} warnings`,
    );

    return {
      workflows,
      validationResults,
      validWorkflows,
      edges,
    };
  }

  /**
   * Calculate file checksum for change detection (AC #4)
   *
   * @param path - Path to file
   * @returns SHA-256 hash as hex string
   */
  async calculateChecksum(path: string): Promise<string> {
    try {
      const content = await Deno.readTextFile(path);
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return "";
    }
  }
}
