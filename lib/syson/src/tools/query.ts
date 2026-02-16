/**
 * SysON Query Tools
 *
 * AQL queries, full-text search, and model traversal.
 * Uses evaluateExpression mutation (not queryBasedObjects which returns null in current SysON).
 *
 * @module lib/syson/tools/query
 */

import type { SysonTool } from "./types.ts";
import { getSysonClient } from "../api/graphql-client.ts";
import { SEARCH_ELEMENTS } from "../api/queries.ts";
import { EVALUATE_EXPRESSION } from "../api/mutations.ts";
import type {
  EvaluateExpressionResult,
  SearchResult,
} from "../api/types.ts";

/**
 * Helper: evaluate an AQL expression via the evaluateExpression mutation.
 * Returns the typed result from the EvaluateExpressionSuccessPayload.
 */
async function evalAql(
  ecId: string,
  expression: string,
  selectedObjectIds: string[],
) {
  const client = getSysonClient();
  const mutationId = crypto.randomUUID();

  const data = await client.mutate<EvaluateExpressionResult>(EVALUATE_EXPRESSION, {
    input: {
      id: mutationId,
      editingContextId: ecId,
      expression,
      selectedObjectIds,
    },
  });

  const result = data.evaluateExpression;
  if (result.__typename === "ErrorPayload") {
    throw new Error(`[lib/syson] evaluateExpression failed: ${result.message}`);
  }
  return result.result;
}

export const queryTools: SysonTool[] = [
  {
    name: "syson_query_aql",
    description:
      "Execute an AQL (Acceleo Query Language) expression on a SysML element. " +
      "This is the most powerful query tool — like a REPL on the model. " +
      "Examples: 'aql:self.ownedElement', 'aql:self.eAllContents()', " +
      "'aql:self.name', 'aql:self.oclIsKindOf(sysml::PartUsage)'. " +
      "Returns objects (for collection queries) or a string (for scalar queries).",
    category: "query",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        object_id: {
          type: "string",
          description: "ID of the element to query on (the 'self' in AQL)",
        },
        expression: {
          type: "string",
          description:
            "AQL expression starting with 'aql:'. E.g. 'aql:self.ownedElement', " +
            "'aql:self.eAllContents()->select(e | e.oclIsKindOf(sysml::RequirementUsage))'",
        },
      },
      required: ["editing_context_id", "object_id", "expression"],
    },
    handler: async ({ editing_context_id, object_id, expression }) => {
      const ecId = editing_context_id as string;
      const objId = object_id as string;
      const expr = expression as string;

      const exprResult = await evalAql(ecId, expr, [objId]);

      switch (exprResult.__typename) {
        case "ObjectExpressionResult":
          return {
            objectId: objId,
            expression: expr,
            type: "object",
            result: {
              id: exprResult.objValue.id,
              kind: exprResult.objValue.kind,
              label: exprResult.objValue.label,
            },
          };
        case "ObjectsExpressionResult":
          return {
            objectId: objId,
            expression: expr,
            type: "objects",
            results: exprResult.objsValue.map((o) => ({
              id: o.id,
              kind: o.kind,
              label: o.label,
            })),
            count: exprResult.objsValue.length,
          };
        case "StringExpressionResult":
          return { objectId: objId, expression: expr, type: "string", result: exprResult.strValue };
        case "BooleanExpressionResult":
          return { objectId: objId, expression: expr, type: "boolean", result: exprResult.boolValue };
        case "IntExpressionResult":
          return { objectId: objId, expression: expr, type: "int", result: exprResult.intValue };
        case "VoidExpressionResult":
          return { objectId: objId, expression: expr, type: "void", result: null };
        default:
          return { objectId: objId, expression: expr, type: "unknown", result: exprResult };
      }
    },
  },

  {
    name: "syson_search",
    description:
      "Full-text search across all elements in a SysON project model. " +
      "Supports case-sensitive, whole-word, and regex matching.",
    category: "query",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        text: {
          type: "string",
          description: "Search text",
        },
        match_case: {
          type: "boolean",
          description: "Case-sensitive search. Default: false",
        },
        whole_word: {
          type: "boolean",
          description: "Match whole words only. Default: false",
        },
        use_regex: {
          type: "boolean",
          description: "Treat search text as regex. Default: false",
        },
      },
      required: ["editing_context_id", "text"],
    },
    handler: async ({ editing_context_id, text, match_case, whole_word, use_regex }) => {
      const client = getSysonClient();

      const data = await client.query<SearchResult>(SEARCH_ELEMENTS, {
        editingContextId: editing_context_id as string,
        query: {
          text: text as string,
          matchCase: (match_case as boolean) ?? false,
          matchWholeWord: (whole_word as boolean) ?? false,
          useRegularExpression: (use_regex as boolean) ?? false,
          searchInAttributes: true,
        },
      });

      const searchResponse = data.viewer.editingContext.search;

      // Check for error
      if ("message" in searchResponse) {
        throw new Error(`[lib/syson] Search failed: ${searchResponse.message}`);
      }

      const matches = searchResponse.result?.matches ?? [];
      return {
        query: text,
        matches: matches.map((m) => ({
          id: m.id,
          kind: m.kind,
          label: m.label,
          iconURLs: m.iconURLs ?? [],
        })),
        count: matches.length,
      };
    },
  },

  {
    name: "syson_query_eval",
    description:
      "Evaluate an AQL expression as a mutation (EvaluateExpression). " +
      "Returns typed results: objects, strings, booleans, or integers. " +
      "Can also modify the model (e.g. eSet to rename). " +
      "Useful for expressions that modify the model or need typed return values.",
    category: "query",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        expression: {
          type: "string",
          description: "AQL expression to evaluate (e.g. 'aql:self.name')",
        },
        selected_object_ids: {
          type: "array",
          items: { type: "string" },
          description: "IDs of selected objects (context for the expression)",
        },
      },
      required: ["editing_context_id", "expression", "selected_object_ids"],
    },
    handler: async ({ editing_context_id, expression, selected_object_ids }) => {
      const exprResult = await evalAql(
        editing_context_id as string,
        expression as string,
        selected_object_ids as string[],
      );

      switch (exprResult.__typename) {
        case "ObjectExpressionResult":
          return {
            type: "object",
            value: {
              id: exprResult.objValue.id,
              kind: exprResult.objValue.kind,
              label: exprResult.objValue.label,
            },
          };
        case "ObjectsExpressionResult":
          return {
            type: "objects",
            value: exprResult.objsValue.map((o) => ({
              id: o.id,
              kind: o.kind,
              label: o.label,
            })),
            count: exprResult.objsValue.length,
          };
        case "StringExpressionResult":
          return { type: "string", value: exprResult.strValue };
        case "BooleanExpressionResult":
          return { type: "boolean", value: exprResult.boolValue };
        case "IntExpressionResult":
          return { type: "int", value: exprResult.intValue };
        case "VoidExpressionResult":
          return { type: "void", value: null };
        default:
          return { type: "unknown", raw: exprResult };
      }
    },
  },

  {
    name: "syson_query_requirements_trace",
    description:
      "Trace requirements to their satisfying elements. " +
      "For each requirement, finds which parts/components satisfy it using AQL.",
    category: "query",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        root_id: {
          type: "string",
          description: "Root element ID to search requirements from",
        },
      },
      required: ["editing_context_id", "root_id"],
    },
    handler: async ({ editing_context_id, root_id }) => {
      const ecId = editing_context_id as string;
      const rootId = root_id as string;

      // Find all RequirementUsage elements via evaluateExpression
      const reqResult = await evalAql(
        ecId,
        "aql:self.eAllContents()->select(e | e.oclIsKindOf(sysml::RequirementUsage))",
        [rootId],
      );

      if (reqResult.__typename !== "ObjectsExpressionResult") {
        return {
          rootId,
          requirementsCount: 0,
          traces: [],
          error: `Unexpected result type: ${reqResult.__typename}`,
        };
      }

      const requirements = reqResult.objsValue;

      // For each requirement, find satisfy relationships
      const traces = [];
      for (const req of requirements) {
        try {
          const satisfyResult = await evalAql(
            ecId,
            "aql:self.ownedElement->select(e | e.oclIsKindOf(sysml::SatisfyRequirementUsage))",
            [req.id],
          );

          const satisfiedBy = satisfyResult.__typename === "ObjectsExpressionResult"
            ? satisfyResult.objsValue.map((s) => ({
              id: s.id,
              label: s.label,
              kind: s.kind,
            }))
            : [];

          traces.push({
            requirement: { id: req.id, label: req.label },
            satisfiedBy,
          });
        } catch {
          traces.push({
            requirement: { id: req.id, label: req.label },
            satisfiedBy: [],
            error: "Could not resolve satisfy relationships",
          });
        }
      }

      return {
        rootId,
        requirementsCount: requirements.length,
        traces,
        coverage: {
          total: requirements.length,
          satisfied: traces.filter((t) => t.satisfiedBy.length > 0).length,
          unsatisfied: traces.filter((t) => t.satisfiedBy.length === 0).length,
        },
      };
    },
  },
];
