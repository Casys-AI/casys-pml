# AI Workflows (LangGraph)

## Objet

Workflows complexes d'orchestration IA utilisant **LangGraph** pour des processus multi-étapes avec:
- State management
- Conditional routing
- Iterative loops
- Content validation

## vs Agents

| **agents/** | **workflows/** |
|-------------|----------------|
| Wrappers simples LangChain Tool | Orchestrations LangGraph |
| 1 call = 1 génération | Multi-steps avec state |
| Pas de logique de contrôle | Loops + decisions + retry |
| Ex: TopicSelectorAgent | Ex: TopicSelectorWorkflow |

## Workflows disponibles

### TopicSelector Workflow

**Objectif**: Génération intelligente de topics avec validation d'angle éditorial et détection de doublons stratégiques.

**Flow**:
```
generate (sans briefs, prompt léger)
  ↓
validateAngle (Graph RAG sémantique)
  ↓
decisionNode (score > 0.85?)
  ↓ si conflit
analyzeGaps (récupère angles existants + content gaps)
  ↓
reangle (avec feedback riche)
  ↓
generate (boucle avec feedback)
```

**Fichiers**:
- `topic-selector.types.ts` - State interface + types
- `topic-selector.nodes.ts` - Nodes du graph
- `topic-selector.workflow.ts` - Graph builder + executor

**Usage**:
```typescript
const workflow = createTopicSelectorWorkflow(
  briefStore,
  aiModel,
  promptTemplate,
  logger
);

const result = await workflow.execute(command, {
  maxTopics: 3,
  templatePath: 'prompts/topic-selector.poml',
  maxAttempts: 1,
});
```

**Avantages**:
- ✅ Évite doublons stratégiques (Graph RAG sur EditorialBriefs)
- ✅ Guidance explicite avec content gaps
- ✅ Prompt initial léger (pas de briefs)
- ✅ Validation post-génération
- ✅ Feedback itératif intelligent

## Architecture

```
Application (use case)
    ↓ utilise port SelectTopicExecutePort
Infrastructure (workflow)
    ↓ utilise
Infrastructure (agents + stores + services)
```

## Tests

```bash
# Tests unitaires des nodes
pnpm test workflows/topic-selector.nodes.test.ts

# Tests d'intégration workflow complet
pnpm test workflows/topic-selector.workflow.test.ts
```

## Bonnes pratiques

1. **Fail-fast**: Validation stricte à chaque node
2. **Logger**: Logs debug à chaque étape du workflow
3. **State immutable**: Nodes retournent `Partial<State>`, jamais de mutation directe
4. **Timeout**: LangGraph gère les timeouts automatiquement
5. **Idempotence**: Nodes doivent être idempotents (retry-safe)

## Futurs workflows

- `outline-writer.workflow.ts` - Multi-source content RAG + enrichment
- `article-refresh.workflow.ts` - Detection obsolescence + regeneration
- `seo-optimizer.workflow.ts` - Iterative optimization loop
