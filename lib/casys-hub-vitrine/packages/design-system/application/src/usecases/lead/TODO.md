# TODO: Lead Analysis Flow Refactoring

## 🎯 Objectif
Créer un flow lead analysis **full streaming** avec parallélisation maximale des 5 étapes.

## 📋 Architecture proposée

### Use Case Principal (Orchestrateur)
- `LeadAnalysisStreamingUseCase` - Orchestre les 5 étapes en streaming parallèle
  - Gère les dépendances entre étapes
  - Maximise le parallélisme
  - Stream tous les événements SSE

### Use Cases Spécialisés (par étape)
1. ✅ `OverviewUseCase` (= Step1Streaming actuel - FAIT)
2. ⏳ `KeywordResearchUseCase` (Step 2 - À FAIRE)
3. ⏳ `ContentCreationUseCase` (Step 3 - À FAIRE)
4. ⏳ `BacklinksUseCase` (Step 4 - À FAIRE)
5. ⏳ `DashboardUseCase` (Step 5 - À FAIRE)

---

## 🚀 Plan d'implémentation

### Phase 1: Refactoring architecture ✅
- [x] Fusionner KeywordExtractionAgent + OntologyBuilder
- [x] Paralléliser BusinessContext + Ontology (Overview)
- [x] Ajouter `<stepwise>` au prompt pour streaming progressif
- [ ] Renommer `LeadAnalysisStep1StreamingUseCase` → `OverviewUseCase`

### Phase 2: Keyword Research (Step 2)
- [ ] Créer `KeywordResearchUseCase`
  - Input: Ontology + Domain metrics
  - Output: opportunities, quickWins, contentGaps, selectedSeeds
- [ ] Paralléliser:
  - `findOpportunities()` - keywords faible compet, haut volume
  - `findQuickWins()` - positions 11-20 faciles à améliorer
  - `analyzeContentGaps()` - topics manquants vs compétiteurs
- [ ] Streaming: chaque opportunity/quickWin dès trouvé

### Phase 3: Content Creation (Step 3)
- [ ] Créer `ContentCreationUseCase`
  - Input: Ontology + Selected seeds
  - Output: topicClusters, contentBriefs, internalLinkingSuggestions
- [ ] Paralléliser avec Keyword Research (dès ontology ready)
- [ ] Générer:
  - Topic clusters (pillar + supporting)
  - Content briefs par topic
  - Suggestions de liens internes

### Phase 4: Backlinks (Step 4)
- [ ] Créer `BacklinksUseCase`
  - Input: Domain
  - Output: backlinkProfile, competitorBacklinks, linkOpportunities
- [ ] Analyser en parallèle dès le début (pas de dépendance)
- [ ] Intégrer avec API backlinks (Ahrefs/SEMrush/custom)

### Phase 5: Dashboard (Step 5)
- [ ] Créer `DashboardUseCase`
  - Input: Tous les outputs précédents
  - Output: summary, recommendations, roadmap
- [ ] Agréger les résultats en continu
- [ ] Calculer KPIs et scores

### Phase 6: Orchestration finale
- [ ] Créer `LeadAnalysisStreamingUseCase` (orchestrateur)
- [ ] Implémenter le graph de dépendances:
  ```
  Discovery (metrics + pages)
    ├─> Overview (businessContext // ontology)
    │     ├─> KeywordResearch
    │     └─> ContentCreation
    ├─> Backlinks (parallèle immédiat)
    └─> Dashboard (agrégation continue)
  ```
- [ ] Route API unique: `GET /api/lead/analyze?domain=x`
- [ ] Tests e2e du flow complet

---

## ⚡ Optimisations de performance

### Parallélisme maximal
```
T=0s:  Discovery (metrics // pages)             ~5s
T=5s:  Overview (businessContext // ontology)   ~40s
T=5s:  Backlinks (parallèle dès début)          ~30s
T=45s: KeywordResearch // ContentCreation       ~20s
T=65s: Dashboard (agrégation)                   ~5s
────────────────────────────────────────────────
Total: ~70s (vs 2min45s+ séquentiel)
```

### Streaming progressif
- Chaque événement streamé dès disponible (SSE)
- Pas d'attente entre steps côté backend
- UI mise à jour en temps réel

---

## 📊 Événements SSE à émettre

```typescript
// Overview
- event: 'metrics' → Domain metrics
- event: 'pages' → Pages scrapées
- event: 'businessContext' → Contexte métier
- event: 'node' → Nœud d'ontologie
- event: 'edge' → Relation d'ontologie

// Keyword Research
- event: 'opportunity' → Opportunité keyword
- event: 'quickWin' → Quick win détecté
- event: 'contentGap' → Gap de contenu

// Content Creation
- event: 'topicCluster' → Cluster de topics
- event: 'contentBrief' → Brief de contenu

// Backlinks
- event: 'backlinkProfile' → Profil backlinks
- event: 'linkOpportunity' → Opportunité de lien

// Dashboard
- event: 'summary' → Résumé final
- event: 'recommendation' → Recommandation
- event: 'done' → Analyse terminée
```

---

## 🔧 Prochaines étapes immédiates

1. **Tester les optimisations actuelles** (BusinessContext // Ontology)
2. **Décider architecture finale**: 1 use case orchestrateur + 5 spécialisés ?
3. **Commencer Step 2** (Keyword Research) si validation OK
