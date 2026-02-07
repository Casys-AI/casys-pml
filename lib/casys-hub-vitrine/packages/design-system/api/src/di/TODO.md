# TODO : Migration DI

## ✅ Phase 1 : Shared (TERMINÉ)
- [x] Interface `SharedCradle`
- [x] Fonction `registerSharedServices()`
- [x] Container root mis à jour
- [x] Build passe
- [x] Documentation

---

## 🔄 Phase 2 : API Use Cases Cradle (PROCHAINE ÉTAPE)

### Objectif
Exposer 10-15 use cases via un **Cradle minimal = Contrat API**

### Tasks
- [ ] Créer interface `ApiUseCasesCradle` dans `di/container.ts`
- [ ] Créer factories conditionnelles dans `di/factories/use-cases.ts`
- [ ] Enregistrer les use cases dans Awilix avec `.scoped()`
- [ ] Mettre à jour `DIServices extends ApiUseCasesCradle`
- [ ] Adapter une route test (ex: `/seo/analyze`) pour utiliser `cradle`
- [ ] Tester en runtime
- [ ] Documenter les patterns

### Use cases à exposer (priorité)
1. `listArticlesUseCase` (simple, bon test)
2. `seoAnalysisUseCase` (feature gating)
3. `generateArticleLinearUseCase` (complexe)
4. `analyzeExistingArticleUseCase` (feature gating)
5. `indexComponentsUseCase`
6. `listComponentsUseCase`
7. `leadAnalysisUseCase`

### Effort estimé
~2-3h de travail

---

## 🔮 Phase 3 : dependency-graph infra (APRÈS PHASE 2)

### Objectif
Gérer automatiquement l'ordre d'installation des services infra

### Tasks
- [ ] Installer `dependency-graph` : `pnpm add dependency-graph`
- [ ] Ajouter `dependencies?: string[]` à l'interface `Installer`
- [ ] Documenter les dépendances pour chaque installer (~50 installers)
- [ ] Implémenter la résolution avec `DepGraph`
- [ ] Valider au boot (cycles + deps manquantes)
- [ ] Ajouter tests unitaires
- [ ] Logger l'ordre d'installation résolu

### Installers prioritaires (exemples)
```typescript
// Neo4j stack
neo4jConnection: [] // Pas de deps
neo4jTenantProjectStore: ['neo4jConnection']
neo4jSeoBriefStore: ['neo4jConnection']
articleStructureStore: ['neo4jConnection', 'embeddingService']

// AI services
aiTextModel: [] // Juste config
seoAnalysisAgent: ['aiTextModel', 'promptTemplate']
editorialAngleAgent: ['aiTextModel']

// Workflows
angleSelectionWorkflow: ['briefStore', 'aiTextModel', 'promptTemplate']
articleGenerationWorkflow: ['aiTextModel', 'promptTemplate', 'sectionContext']
```

### Effort estimé
~3-4h de travail (documentation des dépendances)

---

## 📊 Métriques de succès

### Phase 1 ✅
- [x] Build passe
- [x] Pas de regression runtime
- [x] Type-safety dans shared services

### Phase 2 (à valider)
- [ ] Autocomplétion fonctionne dans les routes
- [ ] Feature gating préservé (501 si désactivé)
- [ ] Pas de regression dans les tests existants
- [ ] Performance identique

### Phase 3 (à valider)
- [ ] Ordre d'installation correct au boot
- [ ] Détection de cycles fonctionne
- [ ] Logs clairs sur les dépendances manquantes
- [ ] Pas de regression runtime

---

## 🚫 Hors scope (décisions prises)

- ❌ **Pas de Cradle global** (tous les services)
  - Risque : Container-Dieu
  - Incompatible : Feature gating
  
- ❌ **Pas de migration Application Container** 
  - Logique trop complexe
  - Bénéfice/effort défavorable
  
- ❌ **Pas d'Awilix pur pour l'infra**
  - Perte du feature gating
  - Refactoring massif

---

## 📚 Références

- [README.md](./README.md) - Architecture et principes
- [MIGRATION.md](./MIGRATION.md) - État de la migration
- `dependency-graph` : https://www.npmjs.com/package/dependency-graph
- Awilix Cradle : https://github.com/jeffijoe/awilix#the-cradle

---

**Dernière mise à jour** : 2025-10-27  
**Prochaine action** : Phase 2 - Créer `ApiUseCasesCradle`
