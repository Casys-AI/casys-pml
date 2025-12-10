# Story Technique: Renommage AgentCards → Casys Intelligence

**Type:** Refactoring Technique **Story ID:** TECH-001 **Status:** implemented **Branche:**
`refactor/rename-to-casys-intelligence`

---

## Contexte

Le projet évolue vers une vision plus large : **Casys Intelligence** - un framework de **Collective
Agentic Intelligence** (CAI). Le naming interne doit refléter cette nouvelle identité.

### Branding

| Élément           | Valeur                          |
| ----------------- | ------------------------------- |
| **Nom produit**   | Casys Intelligence              |
| **Tagline**       | Collective Agentic Intelligence |
| **Acronyme code** | CAI (de "Collective Agentic Intelligence") |
| **Repo GitHub**   | `casys-ai/casys-intelligence`   |
| **Package**       | `@casys/intelligence`           |
| **CLI**           | `cai`                           |

### État Actuel

| Élément          | Valeur Actuelle        | Cible                         | Status     |
| ---------------- | ---------------------- | ----------------------------- | ---------- |
| Repo GitHub      | `Casys-AI/AgentCards`  | `casys-ai/casys-intelligence` | ✅ Créé |
| Package          | (non publié)           | `@casys/intelligence`         | ✅ Créé    |
| Branding externe | "AgentCards"           | "Casys Intelligence"          | ✅ Créé |
| Code interne     | `agentcards`           | `cai`                         | ✅ Créé |

### Périmètre

**~600 occurrences** dans **~100 fichiers** à renommer :

| Catégorie         | ~Count | Exemples                                     |
| ----------------- | ------ | -------------------------------------------- |
| Variables d'env   | 80     | `AGENTCARDS_DB_PATH` → `CAI_DB_PATH`         |
| Fichier DB        | 5      | `.agentcards.db` → `.cai.db`                 |
| Noms d'outils MCP | 30     | `agentcards:execute_dag` → `cai:execute_dag` |
| Logs/strings      | 100    | "AgentCards" → "Casys Intelligence"          |
| Tests             | 120    | Références dans fixtures et mocks            |
| Docs internes     | 100    | ADRs, spikes, comments                       |
| Config            | 40     | docker-compose, deno.json, monitoring        |

---

## User Story

**En tant que** mainteneur open source, **Je veux** que le naming interne soit cohérent avec le nom
du repo, **Afin de** éviter la confusion pour les contributeurs et utilisateurs.

---

## Critères d'Acceptation

1. [x] Aucune occurrence de "agentcards" dans le code (hors git history)
2. [x] Tous les tests passent
3. [x] Variables d'environnement renommées avec backward-compat
4. [x] Guide de migration pour utilisateurs existants
5. [x] PR reviewed et merged

---

## Tasks

### Phase 1: Préparation

- [x] **T1.1** Renommer repo GitHub vers `Casys-AI/casys-intelligence`
- [x] **T1.2** Créer branche `refactor/rename-to-casys-intelligence` depuis `main`
- [x] **T1.3** Backup de la DB de dev si nécessaire

### Phase 2: Variables d'Environnement

- [x] **T2.1** Renommer `AGENTCARDS_DB_PATH` → `CAI_DB_PATH`
- [x] **T2.2** Renommer `AGENTCARDS_WORKFLOW_PATH` → `CAI_WORKFLOW_PATH`
- [x] **T2.3** Ajouter backward-compat avec deprecation warning
- [x] **T2.4** Mettre à jour `.env.example`
- [x] **T2.5** Mettre à jour `docker-compose.yml`

**Fichiers concernés:**

- `src/cli/utils.ts` (~27 occurrences)
- `src/db/client.ts` (~5 occurrences)
- `src/mcp/gateway-server.ts` (~24 occurrences)
- `.env.example`
- `docker-compose.yml`
- `monitoring/` configs

### Phase 3: Dossier Base de Données (PGlite)

- [x] **T3.1** Renommer dossier `.agentcards.db/` → `.cai.db/`
- [x] **T3.2** Mettre à jour `.gitignore` (pattern `*.db` couvre déjà)
- [x] **T3.3** Mettre à jour les paths dans le code
- [x] **T3.4** Ajouter script de migration automatique pour users existants

**Note:** C'est un dossier PGlite (~29MB), pas un fichier SQLite. Simple `mv` suffit.

**Fichiers concernés:**

- `.gitignore`
- `src/db/client.ts`
- Tests d'intégration

### Phase 4: Noms d'Outils MCP

- [x] **T4.1** Renommer préfixe `agentcards:` → `cai:`
- [x] **T4.2** Mettre à jour les schémas d'outils
- [x] **T4.3** Mettre à jour les tests

**Fichiers concernés:**

- `src/mcp/gateway-server.ts`
- `src/mcp/gateway-handler.ts`
- `playground/README.md` (liste des outils)
- Tests MCP

### Phase 5: Logs et Strings

- [x] **T5.1** Remplacer "AgentCards" → "Casys Intelligence" dans les logs
- [x] **T5.2** Mettre à jour les messages d'erreur
- [x] **T5.3** Mettre à jour les banners CLI

**Fichiers concernés:**

- `src/telemetry/logger.ts`
- `src/errors/error-types.ts`
- `src/cli/commands/*.ts`
- `src/main.ts`

### Phase 6: Tests

- [x] **T6.1** Mettre à jour les fixtures
- [x] **T6.2** Mettre à jour les mocks
- [x] **T6.3** Exécuter la suite complète de tests
- [x] **T6.4** Corriger les tests cassés

**Fichiers concernés:**

- `tests/fixtures/`
- `tests/mocks/`
- Tous les fichiers `*_test.ts`

### Phase 7: Documentation Interne

- [x] **T7.1** Mettre à jour les ADRs
- [x] **T7.2** Mettre à jour les spikes
- [x] **T7.3** Mettre à jour les comments dans le code

**Fichiers concernés:**

- `docs/adrs/`
- `docs/spikes/`
- Comments dans `src/`

### Phase 8: Config et DevOps

- [x] **T8.1** Mettre à jour `deno.json` (tasks si nécessaire)
- [x] **T8.2** Mettre à jour `docker-compose.yml`
- [x] **T8.3** Mettre à jour configs monitoring (Prometheus, Promtail)
- [x] **T8.4** Mettre à jour `.devcontainer/`

**Fichiers concernés:**

- `deno.json`
- `docker-compose.yml`
- `monitoring/*.yaml`
- `.devcontainer/`

### Phase 9: Finalisation

- [x] **T9.1** Créer `docs/MIGRATION.md` pour les utilisateurs existants
- [x] **T9.2** Exécuter `deno task test` - tous verts
- [x] **T9.3** Exécuter `deno task check` - pas d'erreurs
- [x] **T9.4** Créer PR avec description détaillée
- [x] **T9.5** Review et merge

---

## Notes de Migration

Pour les utilisateurs existants avec une installation `agentcards` :

```bash
# Ancien (déprécié, fonctionnera avec warning)
AGENTCARDS_DB_PATH=./data/.agentcards.db

# Nouveau (recommandé)
CAI_DB_PATH=./data/.cai.db
```

Les anciennes variables seront supportées avec un warning de dépréciation pendant 2 versions
mineures.

---

## Risques

| Risque                                | Impact | Mitigation                          |
| ------------------------------------- | ------ | ----------------------------------- |
| Tests cassés après rename             | Moyen  | Exécuter tests après chaque phase   |
| Users avec config existante           | Faible | Backward-compat + migration guide   |
| Outils MCP renommés cassent workflows | Moyen  | Documenter clairement le changement |

---

## Definition of Done

- [x] Aucune occurrence de "agentcards" (case-insensitive) dans le code
- [x] `grep -ri agentcards src/ tests/` retourne 0 résultats
- [x] Tous les tests passent (`deno task test`)
- [x] Type check passe (`deno task check`)
- [x] Guide de migration créé
- [x] PR mergée dans `main`
