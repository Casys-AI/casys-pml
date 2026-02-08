# Note Architecture: Serveur vs Client

**Date:** 2026-01-27
**Status:** En attente de décision
**Impact:** Spec 01, Spec 02, Spec 03

---

## Contexte

L'investigation du code a révélé une séparation claire des responsabilités :

| Composant | Serveur (`src/`) | Client (`packages/pml/`) |
|-----------|:----------------:|:------------------------:|
| MCP Discovery (`tools/list`) | ✅ | ❌ |
| Tool schema storage | ✅ DB PostgreSQL | ❌ |
| SHGAT scoring | ✅ | ❌ |
| DRDSP pathfinding | ✅ | ❌ |
| DAG suggestion | ✅ | ❌ |
| Spawn MCPs locaux | ❌ | ✅ `StdioManager` |
| Config `.pml.json` | ❌ | ✅ |
| Permissions HIL | ❌ | ✅ |
| Exécution sandbox | ❌ | ✅ |

---

## Problème

La Spec 01 propose que le **client** découvre les MCPs (BYOK - chaque user a ses propres API keys), mais :

1. La **DB** (`tool_schema`) est côté **serveur**
2. Le **graph sync** est côté **serveur**
3. **SHGAT/DRDSP** sont côté **serveur**

Comment le client peut-il découvrir les tools et les rendre disponibles pour le scoring ?

---

## Options

### Option A: Client découvre → envoie au serveur

```
User configure .pml.json (mcpServers)
         ↓
Client: spawn MCP → tools/list
         ↓
Client: POST /api/tools/sync { tools, observedArgs }
         ↓
Serveur: upsert tool_schema → syncGraphFromDatabase()
         ↓
SHGAT peut scorer ces tools
```

**Avantages:**
- Architecture existante préservée
- SHGAT reste centralisé
- Un seul graph global

**Inconvénients:**
- Latence réseau pour sync
- Dépendance au serveur pour discovery
- API à créer côté serveur

---

### Option B: Client stocke localement (PGlite + SHGAT local)

```
User configure .pml.json (mcpServers)
         ↓
Client: spawn MCP → tools/list
         ↓
Client: PGlite local → tool_schema
         ↓
Client: lib/shgat local pour scoring
         ↓
Pas besoin du serveur pour suggestion
```

**Avantages:**
- 100% offline possible
- Pas de latence réseau
- BYOK complet

**Inconvénients:**
- Duplication de SHGAT (lib/shgat existe déjà mais pas intégré au client)
- Pas de graph global (chaque user isolé)
- Plus complexe à maintenir

---

### Option C: Serveur découvre (pas de BYOK client)

```
User configure MCPs sur le serveur (dashboard/API)
         ↓
Serveur: spawn MCP → tools/list → store
         ↓
Client: utilise les tools découverts par le serveur
```

**Avantages:**
- Pas de changement client
- Architecture simple

**Inconvénients:**
- ❌ Pas de BYOK - le serveur a besoin des API keys
- ❌ Pas offline
- ❌ Problème de sécurité (API keys centralisées)

---

### Option D: Hybride (Client découvre, serveur agrège optionnel)

```
Client: spawn MCP → tools/list → PGlite local
         ↓
Client: scoring local basique (embeddings + cosine)
         ↓
(Optionnel) Client: sync au serveur pour SHGAT avancé
```

**Avantages:**
- Fonctionne offline
- SHGAT optionnel pour amélioration
- BYOK préservé

**Inconvénients:**
- Deux modes à maintenir
- Scoring local moins bon que SHGAT

---

## Questions à clarifier

1. **Le client doit-il fonctionner offline ?**
   - Si oui → Option B ou D
   - Si non → Option A acceptable

2. **SHGAT est-il obligatoire pour le scoring ?**
   - Si oui → Option A (serveur obligatoire)
   - Si non → Option B/D (scoring local possible)

3. **Les tools découverts doivent-ils être partagés entre users ?**
   - Si oui → Option A (graph global)
   - Si non → Option B (isolation user)

4. **Le serveur Casys cloud est-il toujours disponible ?**
   - Si oui → Option A
   - Si non → Option B/D

---

## État actuel du code

### Serveur (`src/`)
- `MCPClient.listTools()` → fait `tools/list` ✅
- `tool_schema` table → existe ✅
- `syncGraphFromDatabase()` → charge tools dans graph ✅
- `DAGSuggesterAdapter` → utilise SHGAT + DRDSP ✅

### Client (`packages/pml/`)
- `StdioManager` → spawn + `initialize` ✅, mais PAS `tools/list` ❌
- `CapabilityLoader` → obtient schemas via `RegistryClient.fetch()` (cloud) ❌
- Pas de PGlite local ❌
- Pas de SHGAT local ❌ (mais `lib/shgat` existe)

---

## Décision

**Décision prise: 2026-01-27**

| Critère | Choix |
|---------|-------|
| Option retenue | **Option A: Client découvre → envoie au serveur** |
| Offline requis | Non (serveur nécessaire pour SHGAT) |
| SHGAT local | Non (reste côté serveur) |
| Sync serveur | Oui (POST /api/tools/sync) |

### Justification

- **Discovery locale** : Les API keys restent chez le user (BYOK)
- **Stockage serveur** : SHGAT/DRDSP ont besoin du graph centralisé pour scorer
- Le client spawn les MCPs localement car il a accès aux env vars (API keys)
- Le serveur n'a pas besoin des API keys, juste des schemas découverts

### Flow retenu

```
Client (local)                          Serveur (cloud)
─────────────                          ────────────────
.pml.json (mcpServers + API keys)
       ↓
spawn MCP (avec API keys user)
       ↓
tools/list → découvre schemas
       ↓
POST /api/tools/sync ──────────────→ upsert tool_schema + tool_observations
  { tools, observedArgs }                    ↓
                                     observations stockées (multi-tenant)
                                           ↓
                                     syncGraphFromDatabase()
                                           ↓
                                     DAGSuggesterAdapter peut filtrer paths
                                     (SHGAT score, DRDSP paths, puis filtrage observedConfigs)
```

---

## Impact sur les specs

### Spec 01: MCP Config Sync

**Changements requis:**

| Task actuelle | Changement |
|---------------|------------|
| Task 5-6: Discovery | ✅ OK - reste côté client |
| Task 7: Migration DB | ✅ OK - reste côté serveur |
| Task 8: Upsert tools | ⚠️ **Modifier** - client appelle API, serveur fait l'upsert |
| Task 10: syncGraphFromDatabase | ✅ OK - reste côté serveur |

**Nouvelle task à ajouter:**
- **Task X: Créer endpoint POST /api/tools/sync**
  - File: `src/api/tools.ts`
  - Input: `{ tools: DiscoveredTool[], observedArgs: Record<string, string[]> }`
  - Action: Upsert `tool_schema` + insert `tool_observations` (multi-tenant)
  - Déclenche: `syncGraphFromDatabase()` (ou lazy au prochain suggest)

**Flow modifié:**
```typescript
// Client (packages/pml/src/discovery/tool-sync.ts)
export async function syncDiscoveredTools(
  cloudUrl: string,
  apiKey: string,
  results: DiscoveryResult[],
): Promise<void> {
  await fetch(`${cloudUrl}/api/tools/sync`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: JSON.stringify({ tools: results }),
  });
}
```

### Spec 02: Config-Aware Discovery

**Pas de changement** - le filtrage se fait côté serveur dans `DAGSuggesterAdapter` après que les tools sont sync.

### Spec 03: Config Permission HIL

**Pas de changement** - le HIL reste côté client, seul le changement de config déclenche un re-sync vers serveur.
