/**
 * Onshape Configuration & Variable Tools
 *
 * MCP tools for configuration management: get/update configurations,
 * encode configuration strings, and manage variable studios.
 *
 * Onshape API Reference:
 *   - Configurations: GET/POST /elements/d/{did}/{wvm}/{wvmid}/e/{eid}/configuration
 *   - Config encoding: POST /elements/d/{did}/e/{eid}/configurationencodings
 *   - Variables: GET/POST /variables/d/{did}/{wvm}/{wvmid}/e/{eid}/variables
 *   - Variable Studios: POST /variables/d/{did}/w/{wid}
 *
 * @module lib/onshape/tools/configurations
 */

import type { OnshapeTool } from "./types.ts";

export const configurationTools: OnshapeTool[] = [
  // ── Get Configuration ────────────────────────────────────────────────────

  {
    name: "onshape_config_get",
    description:
      "Get the current configuration of an element (Part Studio or Assembly). " +
      "Returns all configuration parameters with their current values, types, and allowed options.",
    category: "configurations",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wvm_type: {
          type: "string",
          description: "Workspace/version/microversion selector: 'w', 'v', or 'm' (default 'w')",
          enum: ["w", "v", "m"],
        },
        wvm_id: { type: "string", description: "Workspace, version, or microversion ID (24-char hex)" },
        eid: { type: "string", description: "Element ID (24-char hex)" },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_config_get] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_config_get] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_config_get] 'eid' is required");

      const wvm = (input.wvm_type as string) ?? "w";

      const result = await ctx.client.get(
        `/elements/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}/configuration`,
      );

      return { data: result };
    },
  },

  // ── Update Configuration ─────────────────────────────────────────────────

  {
    name: "onshape_config_update",
    description:
      "Update the configuration of an element. Provide an array of configuration parameters " +
      "with their new values. Each parameter needs parameterId and parameterValue. " +
      "Get current config with onshape_config_get first to see available parameters.",
    category: "configurations",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wvm_type: {
          type: "string",
          description: "Workspace/version/microversion selector: 'w', 'v', or 'm' (default 'w')",
          enum: ["w", "v", "m"],
        },
        wvm_id: { type: "string", description: "Workspace, version, or microversion ID (24-char hex)" },
        eid: { type: "string", description: "Element ID (24-char hex)" },
        configuration_parameters: {
          type: "array",
          description: "Configuration parameters to set: [{parameterId, parameterValue, ...}]",
          items: {
            type: "object",
            properties: {
              parameterId: { type: "string", description: "Parameter ID from the configuration schema" },
              parameterValue: {
                type: "string",
                description: "New value for the parameter (string representation)",
              },
            },
            required: ["parameterId", "parameterValue"],
          },
        },
      },
      required: ["did", "wvm_id", "eid", "configuration_parameters"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_config_update] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_config_update] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_config_update] 'eid' is required");
      if (
        !input.configuration_parameters ||
        !Array.isArray(input.configuration_parameters) ||
        input.configuration_parameters.length === 0
      ) {
        throw new Error(
          "[onshape_config_update] 'configuration_parameters' must be a non-empty array",
        );
      }

      const params = (
        input.configuration_parameters as Array<{ parameterId: string; parameterValue: string }>
      ).map((p) => {
        if (!p.parameterId || p.parameterValue === undefined) {
          throw new Error(
            "[onshape_config_update] Each parameter must have 'parameterId' and 'parameterValue'",
          );
        }
        return p;
      });

      const wvm = (input.wvm_type as string) ?? "w";

      const result = await ctx.client.post(
        `/elements/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}/configuration`,
        { configurationParameters: params },
      );

      return {
        data: result,
        message: `Configuration updated (${params.length} parameter(s))`,
      };
    },
  },

  // ── Encode Configuration ─────────────────────────────────────────────────

  {
    name: "onshape_config_encode",
    description:
      "Encode configuration parameter values into a URL-safe configuration string. " +
      "The encoded string can be used in API URLs to reference a specific configuration " +
      "(e.g. for configured part references in assemblies).",
    category: "configurations",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        eid: { type: "string", description: "Element ID (24-char hex)" },
        parameters: {
          type: "array",
          description: "Parameters to encode: [{parameterId, parameterValue}]",
          items: {
            type: "object",
            properties: {
              parameterId: { type: "string", description: "Parameter ID" },
              parameterValue: { type: "string", description: "Parameter value to encode" },
            },
            required: ["parameterId", "parameterValue"],
          },
        },
      },
      required: ["did", "eid", "parameters"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_config_encode] 'did' is required");
      if (!input.eid) throw new Error("[onshape_config_encode] 'eid' is required");
      if (!input.parameters || !Array.isArray(input.parameters) || input.parameters.length === 0) {
        throw new Error("[onshape_config_encode] 'parameters' must be a non-empty array");
      }

      const params = (
        input.parameters as Array<{ parameterId: string; parameterValue: string }>
      ).map((p) => {
        if (!p.parameterId || p.parameterValue === undefined) {
          throw new Error(
            "[onshape_config_encode] Each parameter must have 'parameterId' and 'parameterValue'",
          );
        }
        return p;
      });

      const result = await ctx.client.post(
        `/elements/d/${input.did as string}/e/${input.eid as string}/configurationencodings`,
        { parameters: params },
      );

      return { data: result };
    },
  },

  // ── Get Variables ────────────────────────────────────────────────────────

  {
    name: "onshape_variables_get",
    description:
      "Get all variables from a Variable Studio element. " +
      "Returns variable names, expressions, types, and current values.",
    category: "configurations",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wvm_type: {
          type: "string",
          description: "Workspace/version/microversion selector: 'w', 'v', or 'm' (default 'w')",
          enum: ["w", "v", "m"],
        },
        wvm_id: { type: "string", description: "Workspace, version, or microversion ID (24-char hex)" },
        eid: { type: "string", description: "Variable Studio element ID (24-char hex)" },
      },
      required: ["did", "wvm_id", "eid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_variables_get] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_variables_get] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_variables_get] 'eid' is required");

      const wvm = (input.wvm_type as string) ?? "w";

      const result = await ctx.client.get<unknown[]>(
        `/variables/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}/variables`,
      );

      const variables = Array.isArray(result) ? result : [];
      return {
        count: variables.length,
        data: variables,
      };
    },
  },

  // ── Set Variables ────────────────────────────────────────────────────────

  {
    name: "onshape_variables_set",
    description:
      "Set or update variables in a Variable Studio element. " +
      "Provide an array of variable objects with name and expression. " +
      "Existing variables are updated, new names create new variables.",
    category: "configurations",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wvm_type: {
          type: "string",
          description: "Workspace/version/microversion selector: 'w', 'v', or 'm' (default 'w')",
          enum: ["w", "v", "m"],
        },
        wvm_id: { type: "string", description: "Workspace, version, or microversion ID (24-char hex)" },
        eid: { type: "string", description: "Variable Studio element ID (24-char hex)" },
        variables: {
          type: "array",
          description: "Variables to set: [{name, expression, description?}]",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Variable name" },
              expression: {
                type: "string",
                description: "Variable expression (e.g. '10 mm', '25.4 in', '3.14')",
              },
              description: { type: "string", description: "Optional variable description" },
            },
            required: ["name", "expression"],
          },
        },
      },
      required: ["did", "wvm_id", "eid", "variables"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_variables_set] 'did' is required");
      if (!input.wvm_id) throw new Error("[onshape_variables_set] 'wvm_id' is required");
      if (!input.eid) throw new Error("[onshape_variables_set] 'eid' is required");
      if (!input.variables || !Array.isArray(input.variables) || input.variables.length === 0) {
        throw new Error("[onshape_variables_set] 'variables' must be a non-empty array");
      }

      const variables = (
        input.variables as Array<{ name: string; expression: string; description?: string }>
      ).map((v) => {
        if (!v.name || !v.expression) {
          throw new Error(
            "[onshape_variables_set] Each variable must have 'name' and 'expression'",
          );
        }
        const mapped: Record<string, string> = {
          name: v.name,
          expression: v.expression,
        };
        if (v.description) mapped.description = v.description;
        return mapped;
      });

      const wvm = (input.wvm_type as string) ?? "w";

      const result = await ctx.client.post(
        `/variables/d/${input.did as string}/${wvm}/${input.wvm_id as string}/e/${input.eid as string}/variables`,
        variables,
      );

      return {
        data: result,
        message: `${variables.length} variable(s) set`,
      };
    },
  },

  // ── Create Variable Studio ───────────────────────────────────────────────

  {
    name: "onshape_variable_studio_create",
    description:
      "Create a new Variable Studio element in a document workspace. " +
      "A Variable Studio holds named variables that can be referenced by Part Studios and Assemblies.",
    category: "configurations",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wid: { type: "string", description: "Workspace ID (24-char hex)" },
        name: { type: "string", description: "Name for the new Variable Studio" },
      },
      required: ["did", "wid", "name"],
    },
    handler: async (input, ctx) => {
      if (!input.did) throw new Error("[onshape_variable_studio_create] 'did' is required");
      if (!input.wid) throw new Error("[onshape_variable_studio_create] 'wid' is required");
      if (!input.name) throw new Error("[onshape_variable_studio_create] 'name' is required");

      const result = await ctx.client.post<{ id: string; name: string }>(
        `/variables/d/${input.did as string}/w/${input.wid as string}`,
        { name: input.name as string },
      );

      return {
        data: result,
        message: `Variable Studio '${result.name}' created (id: ${result.id})`,
      };
    },
  },
];
