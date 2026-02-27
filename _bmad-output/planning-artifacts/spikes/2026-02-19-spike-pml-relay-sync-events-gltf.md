O# Spike — PML comme relais unique pour les sync events → glTF Onshape

**Date**: 2026-02-19
**Contexte**: Pipeline SysON → Onshape 3D. Un composite viewer (model-explorer + 3d-viewer) doit permettre à l'utilisateur de cliquer sur un élément SysON et déclencher l'affichage de sa géométrie Onshape — sans que le browser appelle directement l'API Onshape (credentials).
**Objectif du spike**: Identifier comment PML peut être le seul relais entre l'event frontend et l'appel Onshape authentifié.

---

## État actuel

### Ce qui existe

**Composite event bus** (`composite-generator.ts`) :
- Les viewers communiquent via `postMessage` à travers le composite HTML
- Format : viewer source appelle `app.updateModelContext({ structuredContent: { event: "element-select", ... } })`
- Le composite route vers le viewer cible via les sync rules déclarées dans la capability
- Le viewer cible reçoit ça dans `app.ontoolresult` avec `result.action + result.data`

**Sync rules** (déclarées dans `uiOrchestration` d'une capability) :
```typescript
sync: [
  { from: "syson:syson_element_children", event: "element-select", to: "onshape:onshape_export_gltf", action: "load-3d" }
]
```

**Contrainte** : le browser (viewer iframe) ne peut pas appeler l'API Onshape directement — CORS + credentials OAuth HMAC.

---

## Options investiguées

### Option A — Proxy HTTP dans PML server

**Principe** : ajouter un endpoint `GET /api/gltf-proxy?did=&wid=&eid=&type=` au PML server. Le viewer fait un `fetch` relatif vers ce proxy.

```
browser (3d-viewer iframe)
  → fetch("/api/gltf-proxy?did=xxx&wid=yyy&eid=zzz&type=assembly")
  → PML server (authentifié Onshape)
  → Onshape API /assemblies/.../gltf
  → retourne glTF JSON au browser
```

**Ce qu'il faudrait** :
- Ajouter une route `/api/gltf-proxy` dans `pml-server.ts` (ou `gateway-server.ts`)
- Le viewer 3d connaît l'URL de base via `window.location.origin`
- Le viewer reçoit les refs (did, wid, eid, type) dans l'event, fait le fetch, rend le glTF

**Avantages** :
- Simple à implémenter (~50 LOC)
- PML est le seul point d'accès aux credentials Onshape
- Compatible avec l'event bus existant sans modification

**Inconvénients** :
- Introduit un endpoint HTTP custom hors du protocole MCP
- Le viewer doit connaître `window.location.origin` et assumer que PML sert le proxy (couplage implicite)
- Pas générique : spécifique à Onshape

**Verdict** : Faisable mais contourne MCP plutôt que de s'y intégrer.

---

### Option B — `app.callTool()` depuis le viewer (MCP Apps SDK)

**Principe** : si le SDK MCP Apps expose `app.callTool()`, le viewer peut appeler `onshape_export_gltf` directement, sans passer par le composite.

**Investigation** :
- L'interface MCP Apps actuelle expose : `app.connect()`, `app.ontoolresult`, `app.ontoolinputpartial`, `app.updateModelContext()`
- Pas de `app.callTool()` dans le SDK actuel (`@modelcontextprotocol/ext-apps`)
- Le protocole MCP Apps (SEP-1865) définit `ui/call-tool` comme une capability optionnelle du host

**Ce qu'il faudrait** :
- Implémenter `ui/call-tool` dans le composite host (PML server)
- Exposer `app.callTool(toolName, args)` dans le SDK
- Le composite intercepte l'appel, l'exécute via le sandbox PML, reinjecte le résultat

**Avantages** :
- Architecturalement pur MCP — PML reste le seul exécuteur de tools
- Générique : marche pour n'importe quel tool, pas seulement Onshape
- Le viewer déclare explicitement ce qu'il appelle

**Inconvénients** :
- Requiert une extension du SDK MCP Apps (non trivial)
- Round-trip : viewer → composite HTML → PML server → Onshape API → composite HTML → viewer
- Latence ajoutée vs Option A

**Verdict** : Architecturalement idéal, mais nécessite d'étendre le SDK. Travail non négligeable.

---

### Option C — PML server intercepte les model-context updates (approche "event-driven server-side")

**Principe** : le composite HTML remonte les `ui/update-model-context` events au PML server (pas seulement au composite HTML). PML exécute le tool côté serveur et reinjette le résultat via SSE feed ou via le composite.

```
viewer (model-explorer)
  → app.updateModelContext({ event: "element-select", elementId, onshapeRefs })
  → composite HTML
  → POST /api/sync-event (nouveau endpoint PML)
  → PML exécute onshape_export_gltf()
  → résultat injecté dans 3d-viewer via sendToolResult()
```

**Ce qu'il faudrait** :
- Modifier `generateEventBusScript` pour poster les events au PML server (en plus du routing local)
- Ajouter un endpoint `POST /api/sync-event` dans PML
- PML exécute le tool et pousse le résultat vers le viewer (via SSE ou via response directe)
- Le composite HTML récupère le résultat et appelle `sendToolResult()` vers le 3d-viewer

**Avantages** :
- PML est vraiment le seul relais et le seul exécuteur
- Le routing côté serveur permet des logiques complexes (workflow composé, several tool calls)
- Générique : n'importe quel event peut déclencher n'importe quel workflow PML

**Inconvénients** :
- Plus de code : modification du composite generator + nouvel endpoint PML + mécanisme de push résultat
- Complexité du round-trip : viewer → composite → PML → Onshape → PML → composite → viewer
- State management : PML doit savoir vers quel viewer pousser le résultat

**Verdict** : L'option la plus propre architecturalement — PML est vraiment le cerveau. Mais la plus complexe à implémenter.

---

### Option D — Sync event encode le glTF directement (pre-fetch)

**Principe** : le model-explorer, quand il affiche un élément avec refs Onshape, pré-fetche immédiatement le glTF via un appel PML (lors du chargement initial). Il stocke le glTF en mémoire et l'inclut dans le sync event.

```
model-explorer reçoit la liste des éléments
  → pour chaque élément avec onshapeRefs: fetch glTF via PML tool (déjà exécuté)
  → stocke { elementId → glTF } en mémoire
  → user clique → emit event avec glTF complet dans structuredContent
  → 3d-viewer reçoit le glTF directement, rend sans appel réseau
```

**Problème** : le model-explorer est un viewer statique — il reçoit ses données via `ontoolresult` et ne peut pas appeler des tools. Sauf avec Option B (app.callTool).

**Verdict** : Non viable sans Option B.

---

## Analyse comparative

| Option | Complexité | Pureté archi | PML seul relais | Générique |
|--------|-----------|--------------|-----------------|-----------|
| A — Proxy HTTP | Faible | Moyenne | ✓ (credentials) | ✗ (Onshape-specific) |
| B — app.callTool() | Élevée | Forte | ✓ | ✓ |
| C — Server-side sync | Élevée | Très forte | ✓ | ✓ |
| D — Pre-fetch | Moyenne | Forte | ✓ | Partiel |

---

## Recommandation

**Court terme (POC)** : Option A — proxy HTTP. Permet de valider l'UX (click → 3D) rapidement. PML reste le seul porteur des credentials Onshape.

**Moyen terme** : Option C — PML intercepte les sync events côté serveur. C'est le bon modèle : les viewers sont de purs consommateurs de data, PML orchestre tout. L'event bus composite devient bidirectionnel (viewer → composite HTML → PML server → composite HTML → viewer).

**Ce qui change dans chaque couche** (Option C) :

```
composite-generator.ts
  + generateEventBusScript: si rule.serverSide=true, POST au PML server

pml-server.ts
  + POST /api/sync-event { workflowId, sourceSlot, event, data }
  + exécute le tool/capability correspondant
  + retourne { targetSlot, result }
  + composite injecte via sendToolResult()

capability uiOrchestration
  + sync rule étendue: { from, event, to, action, tool?, args? }
  + ex: { from: "model-explorer", event: "element-select", to: "3d-viewer", action: "load-3d", tool: "onshape_export_gltf", args: { source_type: "assembly" } }
```

---

## Questions ouvertes

1. **Latence** : un round-trip viewer → PML server → Onshape → viewer prend ~2-5s. Acceptable pour une sélection interactive ?
2. **Streaming** : peut-on streamer le glTF progressivement (GLTF binary chunks) pour commencer à rendre avant la fin du download ?
3. **Cache** : PML devrait-il cacher les glTFs par (did, eid, version) pour éviter les re-fetches ?
4. **Auth multi-tenant** : si plusieurs users, les credentials Onshape sont-ils par-user ou globaux dans PML ?
5. **app.callTool()** : faut-il contribuer cette extension au SDK MCP Apps ou créer un fork ?

---

## Prochaines étapes suggérées

- [ ] **P0** : Implémenter Option A (proxy HTTP) pour valider l'UX — 1-2h
- [ ] **P1** : Définir le schema étendu des sync rules avec `tool` + `args`
- [ ] **P1** : Implémenter `POST /api/sync-event` dans pml-server + modification composite-generator
- [ ] **P2** : Étudier `app.callTool()` dans le SDK MCP Apps (PR ou fork ?)
- [ ] **P2** : Ajouter cache glTF côté PML (LRU, TTL basé sur Onshape microversion)
