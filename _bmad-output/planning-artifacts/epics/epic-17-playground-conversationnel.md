# Epic: Playground Conversationnel — Try PML

**Created:** 2026-02-06
**Status:** Draft
**Tech-spec:** `_bmad-output/implementation-artifacts/tech-specs/playground-conversationnel/`

---

## Epic Narrative

> Un visiteur arrive sur `/try`. La page est sombre, presque vide — juste un chat en bas. Il tape "montre-moi les ventes". Une table apparaît. Il demande des métriques — un dashboard se matérialise. Il drag un widget, le colle à un autre, ils communiquent. Il galère — un agent aide pop dans une fenêtre. Il demande une recherche — un navigateur s'ouvre sur le canvas.
>
> **C'est PML en action.** Pas une démo statique. L'utilisateur vit le Conversational Web.

### Proposition de valeur

Le playground est la **vitrine interactive** de PML :
- **Discovery** — L'intent de l'utilisateur trouve les bons outils
- **Execution** — Les outils produisent des UIs dynamiquement
- **Composition** — Les UIs communiquent entre elles (sync rules, event bus)
- **Observabilité** — Tout est visible en temps réel

L'utilisateur parle. PML fait le reste.

### Contexte

- **Accès** : Pas public pour le moment. Objectif = enregistrer une vidéo démo.
- **Hébergement** : Page `/try` sur le même serveur Fresh (port 8081) que la landing, le catalogue et le SaaS.
- **LLM** : Via PML serve (port 3004). Le LLM est appelé via MCP Sampling, pas directement depuis le serveur Fresh. La clé OpenAI est configurée dans PML.
- **Données** : Mock datasets pré-configurés, servis par les MCP tools (les tools retournent des données mock, pas de la vraie donnée).
- **Exécution tools** : Via le package PML local (`pml serve` port 3004), PAS sur le serveur Fresh. Le serveur Fresh ne fait que servir la page.
- **Agents** : Ce sont de vrais MCP tools (`agent_help`, `agent_delegate` dans `lib/std/src/tools/agent.ts`), PAS des appels OpenAI avec un prompt différent.

### Architecture d'exécution

```
┌──────────────────────────────────────────────────────┐
│  NAVIGATEUR (/try)                                    │
│  TryPlaygroundIsland.tsx                              │
│                                                        │
│  Chat → POST /api/playground/chat (serveur Fresh)     │
│         → proxy vers PML serve (port 3004)            │
│         → PML = cerveau (discover + execute + agents) │
│                                                        │
│  UIs MCP → iframes chargées via /api/ui/resource      │
│            → communication via AppBridge (PostMessage) │
└───────────────────────┬──────────────────────────────┘
                        │
          ┌─────────────┴─────────────┐
          │                           │
          ▼                           ▼
┌──────────────────┐       ┌──────────────────┐
│  SERVEUR FRESH   │       │  PML LOCAL       │
│  (port 8081)     │       │  (pml serve)     │
│                  │       │  (port 3004)     │
│  Landing, Catalog│       │                  │
│  SaaS, /try      │       │  discover()      │
│  /api/playground │       │  execute()       │
│  /api/ui/resource│       │  agent tools     │
│                  │       │  MCP Sampling    │
│  Proxy → PML     │       │  routing sécurisé│
└──────────────────┘       └──────────────────┘
```

**Flux complet :**
1. User tape dans le chat → POST /api/playground/chat
2. Le serveur Fresh proxifie vers PML serve (port 3004) via `pml_execute`
3. PML discover les tools pertinents, exécute, retourne les résultats
4. Si un tool a un `_meta.ui` → le client crée un widget avec l'iframe correspondante
5. Les agents sont de vrais MCP tools (`agent_help` retourne `_meta.ui: ui://mcp-std/agent-chat`)

**Pourquoi PML local et pas le serveur :**
- Les tools (filesystem, database, docker) sont conçus pour s'exécuter en local
- Le routing client/serveur du package gère déjà la sécurité
- Pas de risque d'accès au workspace du serveur
- Séparation propre : serveur = UI web, package = exécution
- Les agents utilisent MCP Sampling pour appeler le LLM (pas d'appel OpenAI direct depuis Fresh)
- Si on rend public plus tard, on n'est pas empêtré dans un serveur qui fait tout

**Note CORS :** `pml serve` devra accepter les requêtes cross-origin depuis le domaine du serveur Fresh.

---

## Etat de l'existant

Le playground a déjà une base fonctionnelle :

| Elément | Statut | Fichier |
|---------|--------|---------|
| Route `/try` + page | ✅ Done | `src/web/routes/try.tsx` |
| Island (structure complète) | ✅ Done | `src/web/islands/TryPlaygroundIsland.tsx` |
| Empty state + suggestions cliquables | ✅ Done | Dans l'island |
| Chat bar compact en bas | ✅ Done | Dans l'island |
| API backend chat | ⚠️ **A REFAIRE** | `src/web/routes/api/playground/chat.ts` — appelle OpenAI directement au lieu de PML serve (3004) |
| System prompt + parsing JSON | ⚠️ **A REFAIRE** | Le prompt simule un routing de datasets au lieu de laisser PML discover/execute |
| Agent mode (fenêtres agents) | ❌ **FAUX** | Implémenté comme OpenAI + prompt différent. Doit utiliser les vrais MCP agent tools (`agent_help`, `agent_delegate` dans `lib/std/src/tools/agent.ts`) |
| WidgetFrame + AppBridge + iframe | ✅ Done | Dans l'island |
| Bouton fermer widget (X) | ✅ Done | Dans l'island |
| Drag & drop widgets | ✅ Done | Dans l'island |
| Resize widgets | ✅ Done | Dans l'island |
| Panneau d'observabilité | ✅ Done | Dans l'island (toggle, couleurs, timestamps) |
| UI agent-chat (composant MCP) | ✅ Done | `lib/std/src/ui/agent-chat/` |
| Vrais agent tools MCP | ✅ Done | `lib/std/src/tools/agent.ts` — agent_help, agent_delegate, agent_analyze, etc. |
| Composite generator | ✅ Done | `packages/pml/src/ui/composite-generator.ts` |
| Sync rules / Event bus | ✅ Done | Epic 16.4 |
| Mock datasets | ✅ Done | `src/web/content/playground-datasets.ts` (23 datasets) |
| Tests datasets | ✅ Done | `tests/unit/web/playground-datasets_test.ts` (73 tests) |

---

## User Stories

### US-01: Mock datasets pré-configurés

```gherkin
En tant qu'utilisateur du playground
Quand je demande des données (ventes, KPIs, incidents...)
Je veux voir des données réalistes et cohérentes
Qui sont toujours les mêmes (pas générées à la volée par le LLM)
```

Actuellement le LLM invente les données à chaque fois. On veut des datasets pré-configurés pour :
- Qualité constante (données préparées avec soin)
- Moins de tokens consommés
- Démo reproductible pour la vidéo

**AC:**
- [x] Fichier `src/web/content/playground-datasets.ts` avec tous les datasets
- [x] Datasets : table (8), metrics (6), timeline (5), monitor (4) — cf tech-spec
- [x] System prompt mis à jour : le LLM renvoie un `datasetId` au lieu de générer des données
- [x] Côté serveur (`chat.ts`) : lookup du dataset, injection des données dans la réponse
- [x] Fallback : si datasetId invalide, message d'erreur clair (pas de silent fallback)

---

### US-02: Validation des 5 UIs cibles

```gherkin
En tant qu'utilisateur du playground
Quand un widget apparaît
Je veux que les données s'affichent correctement dans chaque type d'UI
```

On a 5 UIs MCP existantes mais on n'a pas vérifié que les formats de données matchent.

**AC:**
- [x] `table-viewer` : affiche correctement les données tabulaires
- [x] `metrics-panel` : affiche KPIs, gauges, sparklines
- [x] `timeline-viewer` : affiche les événements chronologiques
- [x] `resource-monitor` : affiche CPU, mémoire, réseau
- [x] `agent-chat` : affiche une conversation avec zone messages, input, bouton envoyer
- [x] Vérifier les formats exacts attendus par chaque UI (lire le code dans `lib/std/src/ui/`)

Note : l'UI navigateur web (US-05) n'existe pas encore — elle sera créée et validée dans le cadre de US-05.

---

### US-03: Agent chat dans des fenêtres séparées

> **STATUS: A REFAIRE** — L'implémentation 17.3 utilisait de "faux agents" (appels OpenAI directs avec un system prompt différent). Doit être réécrit avec les vrais MCP agent tools.

```gherkin
En tant qu'utilisateur du playground
Quand je pose une question complexe
Je veux que le système ouvre une fenêtre de conversation séparée avec un agent
Pour avoir une discussion dédiée sans polluer le tunnel principal
```

Le tunnel principal = commandes rapides. Les fenêtres agents = conversations profondes.
L'agent est **générique** — il n'a pas de "type" prédéfini. C'est quand on le lie à un workflow (via composition, US-04) qu'il prend un rôle concret.

**Comment ça doit marcher (vrais agents MCP) :**
1. Le tunnel principal envoie l'intent à PML serve (3004) via `pml_execute`
2. PML discover trouve `agent_help` (ou `agent_delegate`) comme tool pertinent
3. `agent_help` retourne `_meta.ui: { resourceUri: "ui://mcp-std/agent-chat" }` → le client crée un widget agent-chat
4. L'agent utilise MCP Sampling pour ses appels LLM (pas d'appel OpenAI direct)
5. L'agent a accès à tous les MCP tools (il peut `pml_execute` lui-même)

**Ce qui a été mal fait (17.3 — à jeter) :**
- `AGENT_DEFAULT_SYSTEM_PROMPT` = juste un prompt OpenAI différent, pas un vrai agent
- `agentMode: boolean` dans ChatRequest = flag bidon pour switcher de prompt
- `handleAgentMessage()` dans l'island = appelle la même API OpenAI avec `agentMode: true`
- Aucune connexion à PML, aucun MCP tool utilisé

**AC:**
- [ ] L'agent est un vrai MCP tool (`agent_help` / `agent_delegate` dans `lib/std/src/tools/agent.ts`)
- [ ] Le tunnel principal appelle PML serve (3004), PML retourne `_meta.ui` pour ouvrir l'agent-chat
- [ ] La fenêtre agent est un widget sur le canvas (drag, resize, close)
- [ ] Conversation indépendante avec son propre historique (via MCP Sampling)
- [ ] Plusieurs fenêtres agents simultanées possibles
- [ ] L'agent peut envoyer des résultats au canvas (ouvrir d'autres widgets via `_meta.ui`)
- [ ] Pas de types d'agents prédéfinis — l'agent prend son rôle via le workflow auquel il est lié
- [ ] Pas d'appel OpenAI direct depuis le serveur Fresh — tout passe par PML

---

### US-04: Composition de widgets par drag & drop

```gherkin
En tant qu'utilisateur du playground
Quand je drag un widget agent et que je le colle à un table-viewer
Je veux que ça crée un workflow où l'agent est connecté au tableau
Pour pouvoir interroger les données en parlant à l'agent
```

Le use case principal : glisser un agent-chat sur un table-viewer. Le drop déclenche l'agent principal du playground qui compose un workflow liant les deux widgets (via sync rules / event bus d'Epic 16).

Le drag & drop ne crée pas le workflow directement — il appelle l'agent principal qui, via l'IA, compose le workflow en prenant les deux outils comme entrées. C'est PML qui orchestre la composition, pas du code impératif.

**AC:**
- [ ] Drag & drop d'un widget sur un autre détecté (zone de drop visuelle)
- [ ] Le drop déclenche un appel à l'agent principal pour composer le workflow
- [ ] L'agent principal utilise les sync rules / event bus (Epic 16) pour lier les widgets
- [ ] Use case : agent-chat + table-viewer → l'agent peut interroger les données du tableau
- [ ] Layouts automatiques quand les widgets sont composés (horizontal, vertical)
- [ ] Décoller les widgets pour les séparer
- [ ] Communication bidirectionnelle via event bus (déjà implémenté Epic 16)

---

### US-05: Navigateur Chrome embarqué + agent Playwright

```gherkin
En tant qu'utilisateur du playground
Quand je veux naviguer sur le web
Je veux voir une fenêtre Chrome s'ouvrir sur le canvas
Où je peux naviguer moi-même (aller sur Google, cliquer, etc.)
Et optionnellement brancher un agent qui peut lire et agir dans le navigateur
```

Trois couches distinctes, pas un monolithe :
1. **MCP UI `web-browser`** : affiche un Chrome embarqué (via CDP Screencast)
2. **MCP Playwright** : serveur MCP existant qui contrôle Chrome
3. **Agent** : utilise Playwright pour naviguer, l'utilisateur voit les actions en temps réel

**Architecture CDP Screencast :**
```
Chrome (headless) ←→ WebSocket bridge (serveur) ←→ Widget web-browser (canvas)
                                                      ↕
                                                  User input (clicks, keyboard)
```

- Le serveur lance un Chrome, connecte en CDP, stream les frames (`Page.startScreencast`)
- Le widget affiche les frames sur un `<canvas>`
- Les clics/clavier de l'utilisateur sont renvoyés au Chrome via CDP (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`)

**AC:**
- [ ] Widget "navigateur" sur le canvas (drag, resize, close) avec barre d'adresse
- [ ] Chrome embarqué via CDP Screencast (fonctionne avec TOUS les sites, pas de restriction iframe)
- [ ] L'utilisateur peut naviguer lui-même : taper une URL, cliquer, aller sur Google
- [ ] Boutons navigation : back, forward, refresh
- [ ] Input forwarding : clics et clavier de l'utilisateur transmis au Chrome via CDP
- [ ] WebSocket bridge côté serveur pour le streaming frames + input events
- [ ] (Bonus) Un agent peut se connecter au même Chrome via Playwright MCP
- [ ] (Bonus) L'utilisateur voit les actions de l'agent en temps réel dans le widget

---

### US-06: Agent orchestrateur du tunnel principal

```gherkin
En tant qu'utilisateur du playground
Quand je tape une commande dans le chat principal
Je veux qu'un agent LLM orchestre la découverte de tools, compose les arguments, et exécute
Pour que mes intents en langage naturel produisent des résultats concrets
```

**Problème actuel :**
Le tunnel principal envoie `execute({intent})` à PML. SHGAT retourne `suggestions` avec un `callName` (ex: `std:psql_query`) mais **sans arguments remplis**. `accept_suggestion` existe et fonctionne (implémenté session 17.3), mais il a besoin d'`args` que seul un LLM peut composer à partir de l'intent utilisateur et du `inputSchema` du tool.

**Architecture :**
```
User: "combien de traces"
    │
    ▼
chat.ts (proxy Fresh)
    │
    ▼
PML serve (3004) ── execute({intent})
    │
    ├── SHGAT discover → suggestions: { callName: "std:psql_query", inputSchema: {...} }
    │
    ▼
Agent orchestrateur (MCP Sampling / LLM)
    │
    ├── Lit le inputSchema du tool suggéré
    ├── Comprend l'intent utilisateur
    ├── Compose les args: { query: "SELECT count(*) FROM traces" }
    │
    ▼
accept_suggestion({ callName: "std:psql_query", args: { query: "..." } })
    │
    ▼
Résultat → réponse formatée pour l'utilisateur
```

**Différence avec les autres stories :**
- **US-03** : Agent dans des fenêtres séparées (`agent_help`, `agent_delegate`) — conversations dédiées
- **US-06** : Agent **invisible** dans le tunnel principal — orchestre discover → compose args → execute
- **US-07** : Vision long terme — PML comprend l'intent SANS LLM (SHGAT pur, scoring sémantique)

**L'agent orchestre, il ne discute pas.** Pas de fenêtre, pas de conversation. Il reçoit l'intent, utilise les tools PML (discover, accept_suggestion, execute), et retourne un résultat. C'est le **cerveau** du tunnel principal.

**Implémentation :**
L'agent est un MCP tool (`agent_orchestrate` ou réutilisation de la logique dans PML serve). Il utilise MCP Sampling pour appeler le LLM avec un system prompt PML qui explique :
- Comment utiliser `discover` pour trouver les tools
- Comment lire les `inputSchema` des suggestions
- Comment composer les `args` à partir de l'intent
- Comment appeler `accept_suggestion` ou `execute` avec le bon code

**AC:**
- [ ] Quand le tunnel reçoit un intent, un agent LLM orchestre la réponse (pas juste SHGAT seul)
- [ ] L'agent utilise `discover` pour trouver les tools pertinents
- [ ] L'agent lit les `inputSchema` et compose les `args` correctement
- [ ] L'agent appelle `accept_suggestion` ou `execute` avec les args remplis
- [ ] Le résultat est retourné au chat en langage naturel (pas du JSON brut)
- [ ] Si le tool retourne `_meta.ui`, le widget est créé sur le canvas
- [ ] L'agent utilise MCP Sampling (pas d'appel LLM direct depuis Fresh)
- [ ] System prompt PML documenté et versionné
- [ ] Fallback gracieux si le LLM ne comprend pas l'intent (message d'erreur clair)

**Bloque :** US-07 (qui remplacera cet agent par du scoring sémantique pur)
**Bloqué par :** Rien — `accept_suggestion` est déjà implémenté, `discover` fonctionne

---

---

### US-07: Chat PML natif (sans LLM)

> **Note :** US-03 refait déjà la connexion chat → PML serve (3004). US-07 va plus loin : PML comme cerveau UNIQUE, sans LLM du tout. C'est la vision long terme.

```gherkin
En tant qu'utilisateur du playground
Quand j'écris ce que je veux dans le chat
Je veux que PML (discover + execute) comprenne mon intent directement
Sans dépendre d'un LLM externe
```

Architecture cible : le chat envoie l'intent → **PML local** (`pml serve`) → discover → execute → UI.
PML utilise le scoring sémantique (SHGAT, embeddings) pour comprendre l'intent sans LLM.
Si PML ne comprend pas → déclenche un agent (MCP tool) qui lui utilise un LLM via MCP Sampling.

**Différence avec US-03 :**
- US-03 : chat → PML serve → PML utilise `pml_execute` (qui peut invoquer un LLM via MCP Sampling)
- US-07 : chat → PML serve → PML comprend l'intent SANS LLM (scoring sémantique pur)

**AC:**
- [ ] Le frontend envoie l'intent directement à PML local (pas de proxy Fresh)
- [ ] PML discover l'intent par scoring sémantique (pas de LLM)
- [ ] PML exécute les tools pertinents localement
- [ ] Résultat affiché en widgets sur le canvas
- [ ] Pas de coût LLM externe — PML est le cerveau unique
- [ ] Fallback vers agent (MCP tool + LLM) si confiance faible

---

---

## Story Map

```
FAIT (done)                  A REFAIRE / EN COURS              VISION
───────────                  ────────────────────              ──────
US-01 Mock datasets ✓   →  US-06 Agent tunnel principal   →  US-07 PML natif (sans LLM)
US-02 Valider 5 UIs ✓  →  US-03 Agent fenêtres (REDO)
                         →  US-04 Composition D&D
                         →  US-05 Chrome embarqué
```

**US-06 est la priorité immédiate :** Sans agent orchestrateur, le tunnel principal ne peut pas remplir les arguments des suggestions SHGAT. Le chat affiche du JSON brut au lieu de résultats.

**US-03 A REFAIRE :** L'implémentation 17.3 utilisait de faux agents (OpenAI direct + prompt différent).
Doit être réécrite pour utiliser les vrais MCP agent tools (`agent_help`, `agent_delegate`) via PML serve (3004).

**US-06 bloque US-07 :** US-07 remplacera l'agent LLM par du scoring sémantique pur. Mais d'abord, il faut que ça marche AVEC un LLM.

**Ce qu'il faut refaire dans US-03 :**
- `chat.ts` : remplacer l'appel OpenAI direct par un proxy vers PML serve (3004) via `pml_execute`
- Supprimer : `AGENT_DEFAULT_SYSTEM_PROMPT`, `agentMode`, `handleAgentMessage()` (faux agent)
- Le `SYSTEM_PROMPT` actuel (routing de datasetIds) n'a plus lieu d'être — PML fait le routing
- `TryPlaygroundIsland.tsx` : quand PML retourne `_meta.ui`, créer le widget correspondant
- Les datasets mock restent valides mais sont servis par les MCP tools, pas par un lookup serveur

---

## Référence technique

- [tech-spec.md](../../implementation-artifacts/tech-specs/playground-conversationnel/tech-spec.md) — Détails d'implémentation, formats de données
- [architecture-serveur.md](../../implementation-artifacts/tech-specs/playground-conversationnel/architecture-serveur.md) — Architecture server-side mock, checklist formats
- [v2-features.md](../../implementation-artifacts/tech-specs/playground-conversationnel/v2-features.md) — Features avancées : agents, web search, composition

---

## Décisions prises

| Décision | Choix | Raison |
|----------|-------|--------|
| Types d'agents prédéfinis | Non | Un agent sans workflow n'a pas de rôle. Le rôle vient du workflow lié. |
| Détection auto agent aide | Non (pour le moment) | Score de confiance trop complexe. Déclenchement manuel uniquement. |
| Navigateur Chrome embarqué | CDP Screencast + WebSocket | Pas d'iframe (bloqué par la plupart des sites). Chrome contrôlé via CDP, frames streamées au widget, input forwarded. |
| LLM provider | Via PML (MCP Sampling) | Le LLM est appelé par PML via MCP Sampling, pas directement par le serveur Fresh. La clé OpenAI est dans PML. |
| Faux agents | **REJETÉ** | L'implémentation 17.3 utilisait OpenAI + prompt différent. Les agents DOIVENT être de vrais MCP tools (`agent_help`, `agent_delegate` dans `lib/std/src/tools/agent.ts`). |
| Tunnel principal | Proxy vers PML serve (3004) | Le chat.ts ne fait que proxifier vers PML — il n'appelle PAS OpenAI directement, il n'a PAS de system prompt de routing. PML discover + execute fait tout. |
| Brave Search | Abandonné | Approche iframe/API trop limitée. Remplacé par Chrome embarqué (US-05). |
| US-06 composition | Fusionnée dans US-04 | La composition est le use case principal du drag & drop. |
| US-08 infra serveur | Supprimée | On passe par le package PML local, pas besoin de réimplémenter côté serveur. |
| Composition via D&D | Agent orchestre | Le drag & drop ne crée pas le workflow directement — il appelle l'agent principal qui compose via l'IA. |
| Exécution tools PML | Via package local | Les tools passent par `pml serve` (localhost), pas par le serveur Fresh. Sécurité + séparation propre. |
| Page `/try` | Même serveur Fresh | Sur le même serveur que landing, catalog, SaaS. Juste une route de plus. |

## Questions ouvertes

1. **URL finale** : `/try` ou `/playground` ou `/demo` ?
2. **Limite widgets** : Max simultané pour éviter le chaos ?
3. **Chrome instance** : Une instance partagée par session, ou une par widget navigateur ?
4. **Agent + Playwright** : L'agent utilise le MCP Playwright existant, ou faut-il un adapter spécifique pour le connecter au même Chrome que le widget ?
5. **CORS PML serve** : `pml serve` (3004) doit accepter les requêtes cross-origin depuis le domaine Fresh (8081). Comment configurer ? Header CORS dans pml serve ou proxy côté Fresh ?
6. **Datasets mock via MCP tools** : Les tools doivent retourner des données mock. Comment configurer ça ? Flag `--mock` sur `pml serve` ? Datasets dans un MCP tool dédié ? Ou les tools existants retournent du mock en mode playground ?
7. **`_meta.ui` dans pml_execute** : Quand un tool retourne `_meta.ui`, comment le résultat remonte au client ? Le proxy chat.ts doit parser la réponse PML et extraire les `_meta.ui` pour que l'island crée les widgets.

### Context flow et mémoire composite (question architecturale majeure)

Les agents agissent comme des **mémoires persistantes** dans les workflows. Quand on compose/décompose des workflows par drag & drop, le contexte doit suivre :

**Scénarios à gérer :**

1. **Agent branché à un tool** : L'agent charge le contexte du tool (ex: données du table-viewer) dans sa mémoire conversationnelle. C'est le sync rules / event bus d'Epic 16 qui fait transiter les données.

2. **Débranchement** : Si on détache un agent d'un tool, l'agent **garde** la connaissance accumulée (son historique de conversation + les données qu'il a vues). Il ne perd pas son contexte.

3. **Rebranchement sur un autre tool** : L'agent apporte son contexte précédent. Il peut faire du "transfert" — utiliser ce qu'il sait du premier tool pour analyser le second. C'est une forme de **transfer learning conversationnel**.

4. **Mémoire composite** : Quand plusieurs widgets sont composés, il faut une mémoire partagée qui rassemble tout ce qui est à l'intérieur de l'UI composite (pas juste les événements sync, mais aussi le contexte conversationnel des agents).

**Questions techniques :**
- Comment persister le contexte agent quand on détache ? (l'historique de conversation suffit-il ?)
- Faut-il un mécanisme explicite de "snapshot" du contexte avant détachement ?
- Comment injecter le contexte d'un agent dans un autre agent ? (prompt injection ? tool result ?)
- Les sync rules suffisent-elles pour le data flow, ou faut-il un layer au-dessus pour le context flow ?

**User story candidate : "Pipeline d'analyse multi-agents"**

Use case concret pour valider l'architecture :
1. Créer un agent → le connecter à un table-viewer (base de données)
2. L'agent charge et analyse les données de la table
3. Détacher l'agent, le brancher à un nouvel outil (ex: metrics-panel)
4. L'agent utilise sa connaissance de la table pour enrichir l'analyse des métriques
5. Pop un nouvel agent → lui injecter le contexte accumulé
6. Le nouvel agent produit un résumé dans un fichier téléchargeable

Ce use case valide : context persistence, transfer learning, multi-agent handoff, export de résultats.

### Tool scoping : contexte agent vs terminal principal

Deux modes d'invocation des tools dans le playground, avec des comportements différents :

**Depuis un agent (scoped) :**
- L'agent appelle un MCP tool (Memory, Cronjob, table-viewer...)
- Si le tool a une UI → widget créé **dans le contexte de l'agent** (UI composite liée à la fenêtre agent)
- Si le tool n'a PAS d'UI (Memory, Cronjob) → résultat invisible, reste dans la mémoire conversationnelle de l'agent
- L'agent peut appeler Memory pour stocker/retrouver des connaissances, Cronjob pour planifier des tâches — sans rien afficher sur le canvas

**Depuis le terminal principal (unscoped, stateless) :**
- Le terminal peut **créer** :
  - Un widget standalone (1 MCP) → apparaît seul sur le canvas
  - Un composite/workflow standalone (plusieurs MCPs) → apparaît comme un nouveau bloc sur le canvas
- Le terminal **NE PEUT PAS modifier** un composite existant (pas d'ajout/retrait de tools à un workflow déjà sur le canvas)
- Si le tool n'a pas d'UI → réponse affichée dans le terminal principal
- Tout ce que crée le terminal arrive toujours en **standalone** sur le canvas

**Deux façons de modifier un composite existant :**
1. **Drag & drop** : Glisser un widget standalone sur un composite existant → le widget rejoint le composite
2. **Via un agent dans le composite** : Si un agent est déjà dans le composite, lui demander de créer/ajouter des tools → les nouveaux widgets apparaissent dans le contexte du composite

L'agent est le **point d'entrée mutable** du composite — sans agent, le composite ne peut être modifié que par drag & drop depuis le canvas.

**Règle fondamentale : TOUT tool dans un workflow doit être visible.**

Pas de tools invisibles. Si un tool est dans le composite, il a un widget — sinon on ne peut pas voir ni manipuler le workflow. Chaque noeud du workflow = un widget sur le canvas.

Pour les tools qui n'ont pas de "grosse" UI (Memory, Cronjob, Filesystem), on crée des **widgets compacts/informatifs** :

| Tool | Widget compact | Contenu |
|------|---------------|---------|
| `memory` | Mini-widget | Nombre d'entités, blocs de relations, dernière mise à jour |
| `cronjob` | Mini-widget | Tâches planifiées, prochaine exécution, statut |
| `filesystem` | Mini-widget | Fichier en cours, taille, chemin |
| Tout MCP sans UI | Mini-widget générique | Nom du MCP, dernière action, statut |

Ces widgets sont drag & droppables, détachables — comme tous les autres. Ils permettent de visualiser et manipuler le workflow complet.

**Implications architecturales :**
- Les agents doivent pouvoir appeler des MCPs directement (pas seulement via le terminal principal)
- Le routing MCP doit savoir si l'appel vient d'un agent (scoped) ou du terminal (unscoped)
- Quand un agent appelle un tool (même Memory/Cronjob), ça pop un widget dans son composite
- Memory est particulièrement puissant : l'agent peut y stocker son contexte, et un autre agent peut le retrouver → mécanisme de transfert inter-agents
- Il faudra créer des mini-UIs pour les MCPs qui n'en ont pas encore (Memory, Cronjob, etc.) — story dédiée potentielle

### UI composite vs orchestration (question architecturale ouverte — CRITIQUE)

**Deux types de composition, deux problèmes différents :**

| | UI Composite | Orchestration |
|---|---|---|
| **Nature** | Spatiale — widgets côte à côte | Temporelle — tâches en séquence (DAG) |
| **Communication** | Sync rules, event bus (temps réel) | Dépendances, résultats chaînés |
| **Dirigé par** | L'utilisateur (drag & drop) + agents | Le moteur PML (DAG executor) |
| **Scheduling** | Pas de notion de temps | Cronjob, délais, récurrence |
| **Existe dans le playground** | ✓ (Epic 16) | ✗ — pas encore dans le playground |
| **Existe dans le dashboard** | - | ✓ (CytoscapeGraph, DAG visualization) |

Le playground sait montrer des composites visuels (agent + table-viewer côte à côte). Mais les **workflows d'orchestration PML** (A → B → C, avec dépendances et séquencement) ne sont pas encore représentés.

**Le cas Cronjob rend le problème concret :**
- Un cronjob exécute un workflow à intervalles réguliers
- Ce workflow a des étapes séquentielles (fetch data → process → store)
- Comment visualiser ça sur le canvas ? Ce n'est pas juste un composite spatial
- Il faut une notion de **flux temporel** : quelles tâches, dans quel ordre, à quelle fréquence

**Points à ne pas oublier :**
- Les agents ne dirigent PAS les orchestrations — c'est le moteur PML
- Un agent branché sur un table-viewer = simple (2 couches, l'agent lit) — ça c'est de la composition spatiale
- Un workflow orchestré avec cronjob = complexe — c'est de l'orchestration temporelle, ça va au-delà du UI composite
- Peut-être que la visualisation d'orchestration apparaît naturellement avec la story Cronjob
- **Cette question doit rester visible et ne pas être oubliée**

**Note importante :** Le dashboard (`/capabilities`, CytoscapeGraph) sait **déjà** visualiser les DAGs d'orchestration — noeuds, arêtes, dépendances. La question n'est donc pas "comment visualiser une orchestration" (on sait faire) mais "comment intégrer cette visualisation dans le playground" pour qu'elle soit interactive et composable comme le reste.

**Piste :** Réutiliser/adapter le CytoscapeGraph du dashboard comme widget du playground. Quand un workflow orchestré est actif, un mini-DAG interactif apparaît sur le canvas — chaque noeud du DAG correspond à un widget MCP. Ça ferait le pont entre la vue orchestration (dashboard) et la vue composition (playground).
