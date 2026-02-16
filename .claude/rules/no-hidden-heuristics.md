# No Hidden Heuristics Policy

## Rule: THE MODEL IS THE SOURCE OF TRUTH, NOT YOUR GUESSES

**Priority:** CRITICAL

### Problem

Hidden heuristics mask missing data and produce misleading results. The system appears to work but the output is fabricated, not derived from the actual model. Example from 2026-02-16:

```typescript
// BAD - Guesses material from part name
const materialName = await getStringProp(ecId, element.id, "declaredName");
const materialLookup = lookupMaterialByName(materialName); // "Heater" → no match
const material = materialLookup.length > 0 ? materialLookup[0] : undefined;

// BAD - Invents a default mass when material is found
const mass = (await getNumProp(ecId, element.id, "mass")) ?? (material ? 0.1 : undefined);
```

This produced a BOM where:
- Parts named "Steel" would silently match a material (wrong intent)
- Parts got fake 0.1kg default mass (looks real but isn't)
- Users see non-zero costs and think the data is correct

### Required Pattern

**Let the model speak. If data is missing, show it as missing.**

```typescript
// GOOD - Read explicitly from the model, no guessing
const { materialId, mass_kg } = await extractPartAttributes(ecId, element.id);
const material = materialId ? getMaterialPrice(materialId) : undefined;
const mass = mass_kg ?? undefined;
// If no attribute material/mass_kg on the SysML element → no material, no cost
```

### Principles

1. **No fuzzy matching on names** — A part named "Heater" is not a material. Don't guess.
2. **No magic defaults** — If mass isn't specified, it's `undefined`, not `0.1`.
3. **Missing data = missing data** — Show gaps explicitly so users know what to fill in.
4. **Model-driven, not code-driven** — The SysML model (or any upstream model) defines the truth. Code reads it, never invents it.
5. **Heuristics are only acceptable when labeled** — If you must use a heuristic, expose it as a named parameter (e.g. `defaultMass_kg`) so the user explicitly opts in.

### Code Review Checklist

- [ ] Does the code invent values that aren't in the source data?
- [ ] Are there fuzzy name-matching lookups that could match the wrong thing?
- [ ] Are there hardcoded defaults that look like real data?
- [ ] If heuristics exist, are they explicit parameters, not hidden logic?

---

*Added: 2026-02-16 after removing hidden heuristics in plm_bom_generate that guessed materials from part names*
