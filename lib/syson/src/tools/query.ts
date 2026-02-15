/**
 * SysON Query Tools
 *
 * AQL queries, full-text search, and model traversal.
 * AQL (Acceleo Query Language) via queryBasedObjects/queryBasedString is the killer feature.
 *
 * @module lib/syson/tools/query
 */

import type { SysonTool } from "./types.ts";
import { getSysonClient } from "../api/graphql-client.ts";
import { QUERY_BASED_OBJECTS, QUERY_BASED_STRING, SEARCH_ELEMENTS } from "../api/queries.ts";
import { EVALUATE_EXPRESSION } from "../api/mutations.ts";
import type {
  EvaluateExpressionResult,
  QueryBasedObjectsResult,
  QueryBasedStringResult,
  SearchResult,
} from "../api/types.ts";

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
        return_type: {
          type: "string",
          enum: ["objects", "string"],
          description:
            "Expected return type. 'objects' for collections, 'string' for scalar values. Default: objects",
        },
      },
      required: ["editing_context_id", "object_id", "expression"],
    },
    handler: async ({ editing_context_id, object_id, expression, return_type }) => {
      const client = getSysonClient();
      const ecId = editing_context_id as string;
      const objId = object_id as string;
      const expr = expression as string;
      const rtype = (return_type as string) ?? "objects";

      if (rtype === "string") {
        const data = await client.query<QueryBasedStringResult>(QUERY_BASED_STRING, {
          editingContextId: ecId,
          objectId: objId,
          query: expr,
        });
        return {
          objectId: objId,
          expression: expr,
          result: data.viewer.editingContext.object.queryBasedString,
        };
      }

      // Default: objects
      const data = await client.query<QueryBasedObjectsResult>(QUERY_BASED_OBJECTS, {
        editingContextId: ecId,
        objectId: objId,
        query: expr,
      });

      return {
        objectId: objId,
        expression: expr,
        results: data.viewer.editingContext.object.queryBasedObjects.map((obj) => ({
          id: obj.id,
          kind: obj.kind,
          label: obj.label,
          iconURLs: obj.iconURLs ?? [],
        })),
        count: data.viewer.editingContext.object.queryBasedObjects.length,
      };
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
          searchInLibraries: false,
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
      const client = getSysonClient();
      const mutationId = crypto.randomUUID();

      const data = await client.mutate<EvaluateExpressionResult>(EVALUATE_EXPRESSION, {
        input: {
          id: mutationId,
          editingContextId: editing_context_id as string,
          expression: expression as string,
          selectedObjectIds: selected_object_ids as string[],
        },
      });

      const result = data.evaluateExpression;

      if (result.__typename === "ErrorPayload") {
        throw new Error(
          `[lib/syson] evaluateExpression failed: ${result.message}`,
        );
      }

      const exprResult = result.result;
      switch (exprResult.__typename) {
        case "ObjectExpressionResult":
          return {
            type: "object",
            value: {
              id: exprResult.value.id,
              kind: exprResult.value.kind,
              label: exprResult.value.label,
            },
          };
        case "ObjectsExpressionResult":
          return {
            type: "objects",
            value: exprResult.value.map((o) => ({
              id: o.id,
              kind: o.kind,
              label: o.label,
            })),
            count: exprResult.value.length,
          };
        case "StringExpressionResult":
          return { type: "string", value: exprResult.value };
        case "BooleanExpressionResult":
          return { type: "boolean", value: exprResult.value };
        case "IntExpressionResult":
          return { type: "int", value: exprResult.value };
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
      const client = getSysonClient();
      const ecId = editing_context_id as string;
      const rootId = root_id as string;

      // Find all RequirementUsage elements
      const reqData = await client.query<QueryBasedObjectsResult>(QUERY_BASED_OBJECTS, {
        editingContextId: ecId,
        objectId: rootId,
        query:
          "aql:self.eAllContents()->select(e | e.oclIsKindOf(sysml::RequirementUsage))",
      });

      const requirements = reqData.viewer.editingContext.object.queryBasedObjects;

      // For each requirement, find satisfy relationships
      const traces = [];
      for (const req of requirements) {
        try {
          const satisfyData = await client.query<QueryBasedObjectsResult>(QUERY_BASED_OBJECTS, {
            editingContextId: ecId,
            objectId: req.id,
            query: "aql:self.ownedElement->select(e | e.oclIsKindOf(sysml::SatisfyRequirementUsage))",
          });

          traces.push({
            requirement: { id: req.id, label: req.label },
            satisfiedBy: satisfyData.viewer.editingContext.object.queryBasedObjects.map((s) => ({
              id: s.id,
              label: s.label,
              kind: s.kind,
            })),
          });
        } catch {
          // If the AQL query fails for a specific requirement, include it with empty traces
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
