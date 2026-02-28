import type { ExpansionRule, ExpansionStep } from "./types.ts";
import { DOMAIN_SPECS } from "./vocabulary.ts";

/**
 * Build expansion rules from domain specs.
 *
 * Each parent node gets a rule describing its ordered expansion steps.
 * Optional children are included stochastically (default prob: 0.6).
 */
export function buildGrammar(): Map<string, ExpansionRule> {
  const rules = new Map<string, ExpansionRule>();

  for (const { domain, specs } of DOMAIN_SPECS) {
    for (const spec of specs) {
      if (!spec.children || spec.children.length === 0) continue;

      const parentId = `${domain}:${spec.name}`;
      const steps: ExpansionStep[] = (spec.children as Array<{ name: string; optional?: boolean }>).map(c => {
        const childId = c.name.includes(":") ? c.name : `${domain}:${c.name}`;
        return {
          nodeId: childId,
          required: !c.optional,
          probability: c.optional ? 0.6 : 1.0,
        };
      });

      rules.set(parentId, { parentId, steps });
    }
  }

  return rules;
}
