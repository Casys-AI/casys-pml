import type { VaultGraph } from "../core/contracts.ts";
import {
  parseRuntimePayloadMode,
  prepareRuntimeInputsForGraph,
  type RuntimeInputPreparationResult,
  type RuntimeInputValidationResult,
  type RuntimePayloadMode,
  summarizeRuntimeInputCompatibility,
  validateRuntimeInputsForGraph,
} from "./runtime-inputs.ts";

export interface RuntimeInputValidator {
  prepare(
    graph: VaultGraph,
    payload: Record<string, unknown>,
  ): RuntimeInputPreparationResult;
  summarize(
    result: RuntimeInputValidationResult,
    preparation: RuntimeInputPreparationResult,
  ): string;
}

export const defaultRuntimeInputValidator: RuntimeInputValidator = {
  prepare: (graph: VaultGraph, payload: Record<string, unknown>) => {
    const validation = validateRuntimeInputsForGraph(graph, payload);
    return {
      mode: "strict",
      payload,
      projected: false,
      droppedKeys: [],
      validation,
    };
  },
  summarize: summarizeRuntimeInputCompatibility,
};

export function buildRuntimeInputValidator(
  mode: RuntimePayloadMode,
): RuntimeInputValidator {
  return {
    prepare: (graph: VaultGraph, payload: Record<string, unknown>) =>
      prepareRuntimeInputsForGraph(graph, payload, mode),
    summarize: (
      result: RuntimeInputValidationResult,
      preparation: RuntimeInputPreparationResult,
    ) => {
      const summary = summarizeRuntimeInputCompatibility(result);
      if (!preparation.projected) {
        return summary;
      }
      return `${summary} PROJECTED dropped=[${
        preparation.droppedKeys.join(",")
      }]`;
    },
  };
}

export { parseRuntimePayloadMode };
