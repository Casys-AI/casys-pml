# Dependency Injection avec Awilix

## 📋 Architecture actuelle

### Orchestration hybride (Awilix + Registries conditionnels)

```
┌─────────────────────────────────────────────────────────────┐
│                     Awilix Container                         │
│  (Orchestration + Scoping par requête HTTP)                 │
├─────────────────────────────────────────────────────────────┤
│  • shared: createSharedServices()                           │
│  • infraServices: getInfraServices() ← Registry conditionnel│
│  • appServices: getAppServices() ← Registry conditionnel    │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Principes de design

### ✅ Ce qu'on fait (et pourquoi)

1. **Container par requête HTTP** (`di.middleware.ts`)
   - Nouveau scope Awilix pour chaque requête
   - Isolation tenant/project garantie
   - Pas de collision entre requêtes parallèles

2. **Registries conditionnels** (`infrastructure.container.ts`, `application.container.ts`)
   - Feature gating (`enabled: deps => !!deps.apiKey`)
   - Multi-stack (Neo4j vs Kuzu selon `GRAPH_BACKEND`)
   - Services activés dynamiquement selon config

3. **Résolution explicite** (`application.middleware.ts`)
   ```typescript
   // Pré-résoudre pour éviter les proxies lazy
   const infraServices = await container.resolve('infraServices');
   const appServices = await getAppServices(infraServices, { ... });
   ```

### ❌ Ce qu'on évite (et pourquoi)

#### 🚨 **Cradle global** (anti-pattern pour notre contexte)

**Pourquoi c'est dangereux pour nous :**

1. **Multi-stack incompatible**
   ```typescript
   // ❌ Cradle global = les deux toujours présents
   interface Cradle {
     neo4jConnection: Neo4jConnection;
     kuzuConnection: KuzuConnection; // Mais un seul est actif !
   }
   
   // ✅ Registry conditionnel = un seul activé
   if (GRAPH_BACKEND === 'neo4j') {
     services.neo4jConnection = ...;
   } else {
     services.kuzuConnection = ...;
   }
   ```

2. **Feature gating cassé**
   ```typescript
   // ❌ Service toujours dans le type, même si désactivé
   interface Cradle {
     googleScraping: GoogleScrapingPort; // Type dit "présent"
   }
   // Mais si API key manquante → googleScraping = undefined
   // → Type safety cassée
   
   // ✅ Registry conditionnel = type reflète la réalité
   enabled: cfg => !!cfg.DATAFORSEO_API_KEY
   ```

3. **Multi-tenant risqué**
   ```typescript
   // ❌ Cradle singleton = pas de scoping tenant
   const useCase = globalContainer.cradle.generateArticleUseCase;
   // Quel tenant ? Collision possible !
   
   // ✅ Container par requête = scoping automatique
   const requestContainer = container.createScope();
   requestContainer.register({
     tenantId: asValue(req.header('X-Tenant-ID'))
   });
   ```

## 🏗️ Structure des fichiers

```
di/
├── README.md              ← Ce fichier
├── container.ts           ← Container root Awilix
└── [futurs modules]/
    ├── neo4j.module.ts    ← Services Neo4j (si migration modules)
    ├── kuzu.module.ts     ← Services Kuzu (si migration modules)
    └── dataforSeo.module.ts
```

## 🔧 Comment étendre

### Ajouter un nouveau service infrastructure

**Dans `infrastructure.container.ts`** (registry conditionnel) :
```typescript
{
  id: 'myNewService',
  enabled: cfg => !!cfg.myApiKey, // ← Feature gate
  install: async (cfg, svcs, log) => {
    svcs.myNewService = new MyServiceAdapter(cfg.myApiKey);
    log?.debug?.('✅ MyService installé');
  }
}
```

**Dans `di/container.ts`** (Awilix reste inchangé) :
```typescript
// Rien à faire ! infraServices est déjà enregistré
infraServices: asFunction(async ({ infraConfig, logger }) => {
  return await getInfraServices(infraConfig, logger); // ← Appelle le registry
}).singleton()
```

### Ajouter un nouveau use case

**Dans `application.container.ts`** (registry conditionnel) :
```typescript
{
  id: 'myNewUseCase',
  enabled: deps => !!deps.myService,
  build: (deps, services) => {
    services.myNewUseCase = new MyUseCase(deps.myService);
  }
}
```

## 🔮 Évolution future (DÉCISION PRISE)

### ✅ Plan retenu : Cradle API + dependency-graph infra

Après analyse des contraintes (multi-tenant, feature gating, multi-stack), la décision est :

#### 1. **Cradle Awilix = Contrat API uniquement**

**Principe** : Le Cradle expose UNIQUEMENT les use cases consommés par les routes API.

```typescript
// di/container.ts

// ✅ Cradle minimal = contrat API
interface ApiUseCasesCradle {
  // Seulement 10-15 use cases pour l'API
  listArticlesUseCase?: ListArticlesUseCaseImpl;
  seoAnalysisUseCase?: SeoAnalysisUseCase;
  generateArticleLinearUseCase?: GenerateArticleLinearUseCase;
  analyzeExistingArticleUseCase?: AnalyzeExistingArticleUseCase;
  indexComponentsUseCase?: IndexComponentsUseCaseImpl;
  leadAnalysisUseCase?: LeadAnalysisStreamingUseCase;
  // ... (pas 80 services)
}

interface DIServices extends SharedCradle, ApiUseCasesCradle {
  env: NodeJS.ProcessEnv;
  logger: Logger;
  // Infra reste caché (pas dans le cradle)
  infraServices: Awaited<ReturnType<typeof getInfraServices>>;
  applicationServices: Awaited<ReturnType<typeof ApplicationContainer.build>>;
}
```

#### 2. **Mapping explicite Infrastructure → Application**

**Principe** : Séparer les noms techniques (infra) des noms métier (application) via un mapping explicite dans la couche DI.

**Pourquoi** :
- ✅ Infrastructure utilise des noms techniques (`mdxParser`, `articleFetcher`)
- ✅ Application utilise des noms métier (`articleParser`, `articleContentFetcher`)
- ✅ Mapping visible et documenté au bon endroit
- ✅ Facilite le remplacement d'implémentation

**Implémentation** :
```typescript
// di/container.ts

applicationServices: asFunction(async (cradle: DIServices) => {
  const infraServices = await cradle.infraServices;
  
  // ✅ Mapping explicite des noms techniques → noms métier
  const appDeps = {
    ...infraServices,
    // Port métier          Nom technique infra
    articleParser:          infraServices.mdxParser,
    articleContentFetcher:  infraServices.articleFetcher,
  };
  
  const appContainer = new ApplicationContainer(appDeps);
  return appContainer.build();
}).singleton(),
```

**Bénéfices** :
- Architecture hexagonale respectée (ports & adapters)
- Découplage infra/application
- Point unique de mapping (facile à maintenir)
- Demain : remplacer `mdxParser` par `jsonParser` sans toucher l'application

**Consommation dans les routes** :
```typescript
// routes/seo.routes.ts
app.post('/seo/analyze', async (c) => {
  const { seoAnalysisUseCase } = c.get('container').cradle;
  
  // ✅ Autocomplété, typé
  // ✅ Feature gating préservé (undefined si désactivé)
  if (!seoAnalysisUseCase) {
    return c.json({ error: 'Feature not available' }, 501);
  }
  
  const result = await seoAnalysisUseCase.execute(...);
  return c.json(result);
});
```

**Pourquoi** :
- ✅ Type-safety dans les routes (autocomplétion)
- ✅ Pas de container-Dieu (10-15 services, pas 80)
- ✅ Feature gating préservé (`?` optionnels)
- ✅ Frontières métier claires

#### 2. **dependency-graph pour les installers infra**

**Lib** : `dependency-graph` (npm)

**Principe** : Gérer automatiquement l'ordre d'installation des services infra selon leurs dépendances.

```typescript
// infrastructure.container.ts
import { DepGraph } from 'dependency-graph';

interface Installer {
  id: string;
  enabled: (cfg: InfrastructureConfig) => boolean;
  dependencies?: string[]; // ← Déclaration explicite
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
    dependencies: ['neo4jConnection', 'embeddingService'], // ← Ordre automatique
    install: async (cfg, svcs, log) => { ... }
  }
];

// Résolution automatique de l'ordre
const graph = new DepGraph<Installer>();
enabledInstallers.forEach(i => graph.addNode(i.id, i));
enabledInstallers.forEach(i => {
  i.dependencies?.forEach(depId => graph.addDependency(i.id, depId));
});

const orderedIds = graph.overallOrder(); // ← Tri topologique
// → ['neo4jConnection', 'embeddingService', 'articleStructureStore']
```

**Avantages** :
- ✅ Ordre d'installation automatique (tri topologique)
- ✅ Détection de cycles ("A → B → C → A")
- ✅ Validation des dépendances au boot
- ✅ Feature gating préservé (registries conditionnels)
- ✅ Pas de refactoring massif

**Pourquoi** :
- Multi-stack (Neo4j vs Kuzu) → besoin de feature gating
- Multi-tenant → pas de container global
- ~50 services infra → besoin de gestion automatique des deps

#### 3. **Application Container reste tel quel**

**Décision** : Garder `application.container.ts` avec son registry conditionnel.

**Pourquoi** :
- Logique métier complexe (conditions imbriquées)
- Use cases dépendent de multiples combinaisons infra
- Refactoring trop lourd pour le bénéfice

---

## ✅ État d'implémentation (2025-10-29)

### Pattern de mapping explicite : ✅ IMPLÉMENTÉ

**Fichier** : `packages/api/src/di/container.ts`

```typescript
applicationServices: asFunction(async (cradle: DIServices) => {
  const infraServices = await cradle.infraServices;
  
  const appDeps = {
    ...infraServices,
    articleParser:          infraServices.mdxParser,          // ✅ MDX → Article
    articleContentFetcher:  infraServices.articleFetcher,     // ✅ Fetcher technique → métier
    componentSearch:        infraServices.componentListing,   // ✅ Listing → Search
  };
  
  const appContainer = new ApplicationContainer(appDeps);
  return appContainer.build();
}).singleton(),
```

### Use cases activés : 7/8 ✅

| Use Case | Statut | Fix appliqué |
|----------|--------|--------------|
| `listArticlesUseCase` | ✅ | - |
| `indexArticlesUseCase` | ✅ | Zod schema corrigé |
| `seoAnalysisUseCase` | ✅ | - |
| `indexComponentsUseCase` | ✅ | Zod schema corrigé |
| `leadAnalysisUseCase` | ✅ | Zod schema corrigé |
| `analyzeExistingArticleUseCase` | ✅ | Mapping `mdxParser` → `articleParser` |
| `generateArticleLinearUseCase` | ✅ | Mapping `articleFetcher` → `articleContentFetcher` |
| `listComponentsUseCase` | 🔄 | Adaptateur `ComponentListingReadPort` implémenté |

### Corrections appliquées

**1. Schémas Zod** (5 corrections)
- `IndexArticlesDepsSchema`
- `IndexComponentsDepsSchema`  
- `LeadAnalysisDepsSchema`
- `GenerateArticleLinearDepsSchema`
- `AnalyzeExistingArticleDepsSchema`

**2. Adaptateurs**
- `Neo4jComponentStoreAdapter` : implémente maintenant `ComponentListingReadPort` + `ComponentVectorStorePort`

**3. Mappings infrastructure → application**
- `mdxParser` → `articleParser`
- `articleFetcher` → `articleContentFetcher`
- `componentListing` → `componentSearch`

## 📚 Références

- [Awilix documentation](https://github.com/jeffijoe/awilix)
- Pattern "Scoped Container" : `container.createScope()`
- Multi-tenancy : Context par requête HTTP
- Feature flags : Enregistrement conditionnel (`if (enabled) register(...)`)

## 🎯 Règles d'or

1. ✅ **Un container par requête HTTP** (isolation tenant)
2. ✅ **Feature gating dans les registries** (pas dans le Cradle)
3. ✅ **Pré-résoudre les dépendances** (éviter les proxies lazy)
4. ❌ **Pas de Cradle global** (risque multi-tenant/multi-stack)
5. ❌ **Pas de singleton cross-requête** (sauf config/connection pools)
