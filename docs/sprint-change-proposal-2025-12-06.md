# Sprint Change Proposal - Alignement Notebooks Playground avec Epics 7-8

**Date:** 2025-12-06
**Déclencheur:** Implémentation Epic 7 (Emergent Capabilities) et Epic 8 (Hypergraph Visualization)
**Auteur:** Erwan (via Correct-Course workflow)
**Scope:** Moderate

---

## 1. Issue Summary

### Problem Statement

Les notebooks du playground (Epic 2) sont thématiquement désalignés avec la direction actuelle du projet (Epics 7-8).

**Les notebooks actuels/prévus couvrent :**
- Context explosion & vector search (Epic 1 - DONE)
- DAG execution & parallelization (Epic 2 - DONE)
- Sandbox security (Epic 3 - DONE)
- GraphRAG patterns (Epic 5 - DONE)
- Workflow templates (Epic 5 - DONE)

**Les Epics 7-8 en cours se concentrent sur :**
- Worker RPC Bridge pour exécution de code avec MCP tools (Story 7.1b)
- Capability emergence dès la 1ère exécution réussie (Story 7.2a)
- `search_capabilities` tool pour réutiliser du code prouvé (Story 7.3a)
- Suggestion Engine avec adaptive thresholds (Story 7.4)
- Hypergraph visualization des capabilities (Epic 8)

### Context de Découverte

Lors de l'implémentation de Story 7.1b (Worker RPC Bridge), nous avons réalisé que :
1. Le paradigme passe de "DAG workflows MCP" à "code execution avec capabilities émergentes"
2. Les notebooks ne showcasent pas les nouvelles innovations d'Epic 7
3. L'utilisateur voulant apprendre AgentCards n'aura pas de démo des features clés actuelles

---

## 2. Impact Analysis

### 2.1 Epic Impact

| Epic | Impact | Action |
|------|--------|--------|
| Epic 1 (Infrastructure Playground) | Aucun | Conserver tel quel |
| Epic 2 (Notebooks) | **MODÉRÉ** | Mettre à jour Stories 2.5-2.7 |
| Epic 7 (Emergent Capabilities) | Aucun | Continuer normalement |
| Epic 8 (Hypergraph Viz) | Aucun | Continuer normalement |

### 2.2 Story Impact (Epic 2)

| Story | Titre Actuel | Status | Changement Proposé |
|-------|-------------|--------|-------------------|
| 2.1 | Notebook 00 - Introduction | Ready for Review | ✅ Aucun changement |
| 2.2 | Notebook 01 - The Problem | TODO | ✅ Conserver (fondamental) |
| 2.3 | Notebook 02 - Context Optimization | TODO | ✅ Conserver (Epic 1 concept) |
| 2.4 | Notebook 03 - DAG Execution | TODO | ⚠️ Réviser pour mentionner execute_code |
| 2.5 | Notebook 04 - Sandbox Security | TODO | ⚠️ Réviser pour Worker RPC Bridge |
| 2.6 | Notebook 05 - GraphRAG Learning | TODO | ❌ **REMPLACER** par Capability Learning |
| 2.7 | Notebook 06 - Workflow Templates | TODO | ❌ **REMPLACER** par Emergent Capabilities |
| 2.8 | Cleanup Old Notebooks | TODO | ✅ Conserver (archive 15 → 7 fichiers) |

### 2.3 Artifact Conflicts

| Artifact | Conflict | Resolution |
|----------|----------|------------|
| `docs/epics-playground.md` | Stories 2.5-2.7 descriptions obsolètes | Mettre à jour descriptions |
| `docs/stories/playground/` | Stories 2.5-2.7 pas encore créées | Créer avec nouveau focus |
| `playground/notebooks/00-introduction.ipynb` | Table roadmap mentionne anciens notebooks | Mettre à jour la table |
| `playground/README.md` | Liste des notebooks à mettre à jour | Synchroniser avec nouvelle séquence |

### 2.4 Notebooks File Audit

**État actuel (15 fichiers, avec duplications) :**

```
playground/notebooks/
├── 00-introduction.ipynb       ✅ GARDER (nouveau)
├── 01-sandbox-basics.ipynb     🗄️ ARCHIVER (vieux)
├── 01-the-problem.ipynb        ✅ GARDER (nouveau)
├── 02-context-injection.ipynb  🗄️ ARCHIVER (vieux)
├── 02-context-optimization.ipynb ✅ GARDER (nouveau)
├── 03-dag-workflows.ipynb      🗄️ ARCHIVER (vieux)
├── 03-dag-execution.ipynb      ✅ GARDER (nouveau, réviser)
├── 04-mcp-discovery.ipynb      🗄️ ARCHIVER (vieux)
├── 04-sandbox-security.ipynb   ⚠️ RÉVISER (ajouter Worker RPC)
├── 05-context-injection.ipynb  🗄️ ARCHIVER (vieux, doublon)
├── 05-mcp-usage.ipynb          🗄️ ARCHIVER (vieux)
├── 06-llm-integration.ipynb    🗄️ ARCHIVER (vieux)
├── 07-security-demo.ipynb      🗄️ ARCHIVER (vieux)
├── 08-controlled-executor.ipynb 🗄️ ARCHIVER (vieux)
└── 09-workflow-templates.ipynb  🗄️ ARCHIVER (vieux)
```

**État cible (7 fichiers, séquence claire) :**

```
playground/notebooks/
├── 00-introduction.ipynb        # What is Casys Gateway?
├── 01-the-problem.ipynb         # MCP doesn't scale
├── 02-context-optimization.ipynb # Vector search reduces context
├── 03-dag-execution.ipynb       # Parallel execution (révisé)
├── 04-sandbox-security.ipynb    # Safe code execution (révisé pour Worker)
├── 05-capability-learning.ipynb # NOUVEAU: Capabilities emergence
├── 06-emergent-reuse.ipynb      # NOUVEAU: Reuse learned capabilities
└── archive/                     # Old notebooks (8 fichiers)
```

---

## 3. Recommended Approach

### Sélection : **Option 1 - Direct Adjustment**

**Effort:** Medium (2-3 jours)
**Risque:** Low
**Justification:**

1. Les notebooks 00-03 restent valides et utiles
2. Le notebook 04 (Sandbox) est directement pertinent mais nécessite une mise à jour pour Worker RPC
3. Les notebooks 05-06 peuvent être remplacés sans perdre de valeur existante (pas encore créés)
4. Le cleanup (Story 2.8) simplifiera la maintenance

**Alternatives considérées :**

| Option | Description | Verdict |
|--------|-------------|---------|
| Option 2: Rollback | Supprimer tous les notebooks et recommencer | Overkill - 00-03 sont bons |
| Option 3: MVP Review | Réduire scope à seulement 00-04 | Perte de valeur pédagogique Epic 7 |

---

## 4. Detailed Change Proposals

### Change 1: Update `docs/epics-playground.md` (Stories 2.5-2.7)

**Section: Story 2.5**

```markdown
OLD:
### Story 2.5: Notebook 04 - Sandbox Security
...shows sandbox execution with resource limits...

NEW:
### Story 2.5: Notebook 04 - Code Execution & Worker RPC
As a user, I want to see how code executes with MCP tool access, So that I understand how the Worker RPC Bridge enables safe tool usage from sandbox.

**Acceptance Criteria:**
1. Explain Worker RPC Bridge architecture (ADR-032)
2. Demo: Execute code that calls MCP tools via RPC
3. Show native tracing (tool_start, tool_end events)
4. Security demo: blocked operations still work
5. Checkpoint: Write code calling 2 MCP tools
```

**Section: Story 2.6**

```markdown
OLD:
### Story 2.6: Notebook 05 - GraphRAG Learning
...shows graph patterns and recommendations...

NEW:
### Story 2.6: Notebook 05 - Capability Learning
As a user, I want to see how capabilities emerge from code execution, So that I understand the learning system.

**Acceptance Criteria:**
1. Explain Eager Learning (store on 1st success)
2. Demo: Execute code → verify capability created
3. Show capability storage (code_snippet, intent_embedding)
4. Demo: search_capabilities tool usage
5. Checkpoint: Find a capability matching an intent
```

**Section: Story 2.7**

```markdown
OLD:
### Story 2.7: Notebook 06 - Workflow Templates
...define and sync workflow patterns...

NEW:
### Story 2.7: Notebook 06 - Emergent Capability Reuse
As a user, I want to see how to reuse learned capabilities, So that I can skip code generation for proven patterns.

**Acceptance Criteria:**
1. Explain Capability Matching vs code generation
2. Demo: Match intent → retrieve cached capability
3. Show Suggestion Engine recommendations
4. Demo: Capability injection into Worker context
5. Checkpoint: Create and reuse a custom capability
```

**Rationale:** Aligner les stories avec Epic 7 pour que les notebooks showcasent les innovations actuelles.

---

### Change 2: Update `playground/notebooks/00-introduction.ipynb` Roadmap Table

**Cell 4 (The Journey):**

```markdown
OLD:
| Notebook                    | What You'll Learn                                     |
| **05-graphrag-learning**    | See how the system learns patterns                    |
| **06-workflow-templates**   | Define and sync your own workflow patterns            |

NEW:
| Notebook                    | What You'll Learn                                     |
| **05-capability-learning**  | See how capabilities emerge from code execution       |
| **06-emergent-reuse**       | Reuse proven code without regeneration                |
```

**Rationale:** Synchroniser la table avec les nouveaux noms de notebooks.

---

### Change 3: Revise `04-sandbox-security.ipynb`

**Additions to demonstrate Worker RPC Bridge:**

```typescript
// NEW CELL: Worker RPC Bridge Demo
import { WorkerBridge } from "../../src/sandbox/worker-bridge.ts";

const bridge = new WorkerBridge(mcpClients);

// Execute code that calls MCP tools
const code = `
  const content = await mcp.filesystem.read({ path: "./config.json" });
  const data = JSON.parse(content);
  return { projectName: data.name, version: data.version };
`;

const result = await bridge.execute(code);

console.log("Result:", result.output);
console.log("Traces:", result.traces); // Shows tool_start, tool_end events
```

**Rationale:** Montrer la feature clé d'Epic 7.1b - les tool calls tracés nativement.

---

### Change 4: Create `05-capability-learning.ipynb`

**New notebook structure:**

1. Introduction: Why capabilities matter
2. The Eager Learning model (store on first success)
3. Demo: Execute code → capability created
4. Demo: Query capabilities by intent
5. Demo: `search_capabilities` tool usage
6. Checkpoint: Find matching capability for intent

**Rationale:** Remplacer l'ancien focus GraphRAG générique par le système de capabilities spécifique à Epic 7.

---

### Change 5: Create `06-emergent-reuse.ipynb`

**New notebook structure:**

1. Introduction: Code reuse vs regeneration
2. The Capability Matching workflow
3. Demo: Intent → cached capability execution
4. Demo: Suggestion Engine recommendations
5. Demo: Capability injection (inline functions)
6. Checkpoint: Create and reuse custom capability

**Rationale:** Showcaser la valeur unique d'AgentCards vs concurrents (Docker Dynamic MCP, Anthropic PTC).

---

### Change 6: Execute Story 2.8 Cleanup

**Move to archive:**
- `01-sandbox-basics.ipynb`
- `02-context-injection.ipynb`
- `03-dag-workflows.ipynb`
- `04-mcp-discovery.ipynb`
- `05-context-injection.ipynb`
- `05-mcp-usage.ipynb`
- `06-llm-integration.ipynb`
- `07-security-demo.ipynb`
- `08-controlled-executor.ipynb`
- `09-workflow-templates.ipynb`

**Rationale:** Éliminer la confusion créée par les duplications (ex: deux 04-*.ipynb).

---

## 5. Implementation Handoff

### Scope Classification: **MODERATE**

Les changements nécessitent :
- Modification de documentation (epics-playground.md)
- Création de 2 nouveaux notebooks
- Révision d'1 notebook existant
- Cleanup de fichiers

### Handoff Plan

| Role | Responsabilités |
|------|-----------------|
| **Dev Team** | Créer notebooks 05-06, réviser 04 |
| **SM (Scrum Master)** | Réorganiser backlog Epic 2 |
| **Tech Writer** | Mettre à jour epics-playground.md, README |

### Suggested Order

1. ✅ Approuver ce Sprint Change Proposal
2. Mettre à jour `docs/epics-playground.md` (Stories 2.5-2.7)
3. Exécuter Story 2.8 (cleanup) pour réduire confusion
4. Réviser `04-sandbox-security.ipynb` pour Worker RPC
5. Créer `05-capability-learning.ipynb`
6. Créer `06-emergent-reuse.ipynb`
7. Mettre à jour `00-introduction.ipynb` roadmap table
8. Mettre à jour `playground/README.md`

### Success Criteria

- [ ] Notebooks 00-06 forment une séquence cohérente
- [ ] Notebooks showcasent les features Epic 7 (Worker RPC, Capabilities)
- [ ] Pas de fichiers dupliqués dans playground/notebooks/
- [ ] README et Introduction alignés avec nouvelle séquence

---

## 6. PRD MVP Impact

**Impact sur MVP:** Aucun impact négatif

Le MVP AgentCards reste inchangé. Ce changement améliore la **valeur pédagogique** du playground en alignant la documentation avec les capabilities actuelles.

**Bénéfice:** Les utilisateurs découvrant AgentCards via le playground verront les innovations clés (capability learning) plutôt que seulement les fondations (DAG execution).

---

**Document généré par:** Correct-Course Workflow
**Approval Status:** En attente

