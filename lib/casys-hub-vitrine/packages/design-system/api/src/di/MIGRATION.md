# Migration vers Awilix Cradle Pattern

## 🎯 Objectif

Migrer progressivement du pattern "factory functions" vers le pattern **Awilix Cradle** pour :
- ✅ Type-safety complète (autocomplétion TypeScript)
- ✅ Auto-wiring des dépendances
- ✅ Meilleure maintenabilité

## 📊 État de la migration

### ✅ Phase 1 : Shared Services (TERMINÉE)

**Statut** : Complété le 2025-10-27

**Fichiers modifiés** :
- `packages/shared/src/shared.container.ts`
  - Ajout interface `SharedCradle`
  - Ajout fonction `registerSharedServices()`
  - `createSharedServices()` marquée `@deprecated`
- `packages/api/src/di/container.ts`
  - `DIServices extends SharedCradle`
  - Appel à `registerSharedServices()`
- `packages/api/src/middleware/shared.middleware.ts`
  - Plus besoin de résoudre `'shared'`
  - Services accessibles via `container.cradle`

**Résultat** :
```typescript
// ✅ AVANT (type: any)
const shared = await container.resolve('shared');
const dto = shared.dtos.article.createMetadataDTO(...);

// ✅ APRÈS (type: ArticleMetadataDTO)
const createDTO = container.cradle.createArticleMetadataDTO;
const dto = createDTO(...); // Autocomplétion complète !
```

**Services migrés** (11 factories) :
- `createArticleMetadataDTO`
- `createArticleListResponseDTO`
- `createComponentMetadataDTO`
- `createComponentListResponseDTO`
- `createComponentSearchResponseDTO`
- `createComponentUsageDTO`
- `createComponentUsageListResponseDTO`
- `createComponentUsageOperationResponseDTO`
- `createApiResponse`
- `logger` (optionnel)

---

### 🚧 Phase 2 : API Use Cases Cradle (PLANIFIÉ)

**Statut** : Planifié

**Décision** : Créer un **Cradle minimal = Contrat API**

**Principe** : 
- ✅ Exposer UNIQUEMENT les 10-15 use cases consommés par les routes
- ✅ Garder les use cases optionnels (`?`) pour feature gating
- ✅ Pas de container-Dieu (pas 80 services)

**Plan** :
1. Créer `ApiUseCasesCradle` interface (10-15 use cases)
2. Factories conditionnelles avec feature gating
3. Enregistrer dans Awilix avec `.scoped()`
4. Routes consomment via `container.cradle.useCaseName`

**Exemple** :
```typescript
// di/container.ts
interface ApiUseCasesCradle {
  listArticlesUseCase?: ListArticlesUseCaseImpl;
  seoAnalysisUseCase?: SeoAnalysisUseCase;
  generateArticleLinearUseCase?: GenerateArticleLinearUseCase;
  // ... (seulement ce que l'API consomme)
}

// Factories avec feature gating
function buildSeoAnalysisUseCase(infraServices: any): SeoAnalysisUseCase | undefined {
  if (!infraServices.googleScraping || !infraServices.aiTextModel) {
    return undefined; // ← Feature désactivée
  }
  return new SeoAnalysisUseCase(...);
}

// Enregistrement
container.register({
  seoAnalysisUseCase: asFunction(({ infraServices }) => 
    buildSeoAnalysisUseCase(infraServices)
  ).scoped(),
});
```

**Avantages** :
- ✅ Type-safety dans les routes
- ✅ Feature gating préservé
- ✅ Pas de container-Dieu
- ✅ Application Container reste sous le capot

---

### 🔴 Phase 3 : Infrastructure Services (PLANIFIÉ)

**Statut** : Planifié

**Décision** : Utiliser **`dependency-graph`** pour gérer les installers

**Complexité** : Moyenne (pas de refactoring massif)
- ~50+ services à migrer
- Feature gates (Neo4j vs Kuzu, DataForSEO, etc.)
- Gestion automatique des dépendances

#### ✅ Solution retenue : dependency-graph + registries

**Lib** : `dependency-graph` (npm)

**Principe** :
1. Ajouter metadata `dependencies: []` aux installers
2. Utiliser `DepGraph` pour résoudre l'ordre automatiquement
3. Détecter les cycles et dépendances manquantes

**Exemple** :
```typescript
// infrastructure.container.ts
import { DepGraph } from 'dependency-graph';

interface Installer {
  id: string;
  enabled: (cfg: InfrastructureConfig) => boolean;
  dependencies?: string[]; // ← Nouveau
  install: (cfg, svcs, log) => Promise<void>;
}

const installers: Installer[] = [
  {
    id: 'neo4jConnection',
    enabled: cfg => graphBackend === 'neo4j',
    dependencies: [], // Pas de deps
    install: async (cfg, svcs, log) => { ... }
  },
  {
    id: 'articleStructureStore',
    enabled: cfg => graphBackend === 'neo4j',
    dependencies: ['neo4jConnection', 'embeddingService'], // ← Déclaratif
    install: async (cfg, svcs, log) => { ... }
  }
];

// Résolution automatique
const graph = new DepGraph<Installer>();
enabledInstallers.forEach(i => graph.addNode(i.id, i));
enabledInstallers.forEach(i => {
  i.dependencies?.forEach(depId => graph.addDependency(i.id, depId));
});

const orderedIds = graph.overallOrder(); // ← Tri topologique
// → ['neo4jConnection', 'embeddingService', 'articleStructureStore']

// Installation dans le bon ordre
for (const id of orderedIds) {
  const installer = graph.getNodeData(id);
  await installer.install(config, services, logger);
}
```

**Avantages** :
- ✅ Ordre d'installation automatique (tri topologique)
- ✅ Détection de cycles au boot ("A → B → C → A")
- ✅ Validation des dépendances manquantes
- ✅ Feature gating préservé (registries conditionnels)
- ✅ Pas de refactoring massif
- ✅ Documentation automatique (metadata visible)

**Inconvénients** :
- ⚠️ Besoin d'ajouter `dependencies: []` à chaque installer (~1h de travail)

**Pourquoi pas Awilix pur** :
- ❌ Multi-stack incompatible (Neo4j vs Kuzu)
- ❌ Feature gating cassé
- ❌ Container-Dieu (80+ services)
- ❌ Refactoring massif

---

## 🎓 Leçons apprises

### ✅ Ce qui fonctionne bien

1. **Migration progressive par couche**
   - Shared → Application → Infrastructure
   - Permet de valider le pattern à chaque étape

2. **Cradle pour les services simples**
   - Parfait pour les factories de DTOs
   - Type-safety immédiate

3. **Container par requête HTTP**
   - Isolation tenant garantie
   - Pas de collision entre requêtes

### ⚠️ Pièges évités

1. **Cradle global = anti-pattern**
   - Dangereux pour multi-tenant/multi-stack
   - Feature gating cassé
   - Container-Dieu

2. **Proxies lazy d'Awilix**
   - Besoin de pré-résoudre les dépendances
   - Voir `application.middleware.ts` lignes 125-129

3. **Services conditionnels**
   - Retourner `undefined` plutôt que d'échouer
   - Vérifier les dépendances avant construction

---

## 📚 Références

- [Awilix documentation](https://github.com/jeffijoe/awilix)
- [README.md](./README.md) - Architecture et principes
- Pattern Cradle : [Awilix Cradle](https://github.com/jeffijoe/awilix#the-cradle)

---

## 🔮 Prochaines étapes

1. [ ] Tester Phase 1 en runtime (serveur)
2. [ ] Décider si on continue vers Phase 2 ou on s'arrête ici
3. [ ] Documenter les patterns de migration pour l'équipe
4. [ ] Évaluer la valeur ajoutée réelle du Cradle (type-safety vs complexité)

---

**Date dernière mise à jour** : 2025-10-27  
**Auteur** : Migration progressive Awilix
