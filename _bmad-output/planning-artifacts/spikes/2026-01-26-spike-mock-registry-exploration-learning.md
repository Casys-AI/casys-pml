# Spike: Mock Registry & Exploration Learning

**Date**: 2026-01-26
**Status**: Investigation Required
**Priority**: P1 (bloque Story 12.9)
**Durée estimée**: 3-4 jours

## Contexte

Story 12.8 génère des traces "exploratoires" avec un mix d'exécutions réelles (safe tools)
et de mocks (unsafe tools). Questions ouvertes:
1. Comment stocker et curer les mocks de manière persistante?
2. Comment SHGAT apprend des traces partiellement mockées?
3. Comment auto-déprécier les mauvais mocks via les error types?

## Investigation Areas

### 1. Mock Registry Architecture

Remplacer le cache temporaire par un registre persistant:

- Table DB dédiée `mock_registry` ou extension de `capability_cache`?
- Granularité: par tool exact ou par pattern d'arguments?
- Versioning des mocks quand le tool évolue?

### 2. Auto-Curation via Error Types

Réutiliser l'infrastructure existante (migration 024, trace-feature-extractor):

- error_type = VALIDATION → mock a mauvaise shape → déprécier fortement
- error_type = NOT_FOUND → mock référence ressource stale → marquer obsolète
- error_type = NETWORK/TIMEOUT/PERMISSION → pas la faute du mock → ignorer

Existant à connecter:
- `classifyErrorType()` dans migration 024
- `queryErrorTypeAffinity()` dans `trace-feature-extractor.ts`
- `errorRecoveryRate` déjà calculé par tool

### 3. Learning from Exploration Traces

Comment SHGAT traite les traces avec mocks:

- Pondération: trace 100% réelle vs trace 50% mockée?
- Les mocks introduisent-ils du bruit dans l'embedding?
- Faut-il un flag séparé dans TrainingExample pour `mockRatio`?
- Seuil minimum de % réel pour considérer la trace valide?

Hypothèses à tester:
- H1: Traces avec >70% réel donnent un bon signal
- H2: Mocks canonical (validés) n'ajoutent pas de bruit
- H3: Error-based curation améliore la qualité du learning

### 4. Promotion Workflow

Quand un mock devient "canonical" (référence):

- `successCount >= N && failureCount == 0` → promote?
- Ou: `successRate > 0.9` avec `minSamples >= 5`
- Canonical mocks pourraient avoir poids 1.0 dans learning
- Non-canonical mocks auraient poids réduit (0.5?)

## Deliverables

1. **ADR** documentant l'architecture choisie
2. **Benchmark** comparant learning avec/sans mocks
3. **Prototype** de la curation automatique

## Dependencies

- Story 12.5 (Speculation Cache) - base infrastructure
- Story 12.8 (Exploratory Dry-Run) - génère les traces
- Migration 024 (error_type) - classification erreurs
- `trace-feature-extractor.ts` - errorTypeAffinity existant

## Related Files

- `src/speculation/speculation-cache.ts`
- `src/graphrag/learning/trace-feature-extractor.ts`
- Migration 024 (error_type classification)

## Success Criteria

- [ ] Architecture decision documented with clear rationale
- [ ] Benchmark shows learning improvement or quantified trade-offs
- [ ] Prototype demonstrates error-based auto-curation working
- [ ] Clear recommendation for Story 12.9 implementation scope
