import type { VaultGraph } from "../core/contracts.ts";
import {
  type RuntimeInputValidationResult,
  summarizeRuntimeInputCompatibility,
  validateRuntimeInputsForGraph,
} from "./runtime-inputs.ts";

export interface RuntimeInputValidator {
  validate(
    graph: VaultGraph,
    payload: Record<string, unknown>,
  ): RuntimeInputValidationResult;
  summarize(result: RuntimeInputValidationResult): string;
}

export const defaultRuntimeInputValidator: RuntimeInputValidator = {
  validate: validateRuntimeInputsForGraph,
  summarize: summarizeRuntimeInputCompatibility,
};
