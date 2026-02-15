# Spike: Distribution de Capabilities PML via Marketplaces MCP

**Date:** 2026-02-11
**Status:** Exploration
**Author:** Panel d'experts (consolidation rapporteur)
**Panelistes:** marketplace-researcher, tech-architect, business-strategist
**Methodologie:** Recherche independante + confrontation croisee (1 round de questions/reponses)

---

## Décisions Stratégiques du Fondateur (2026-02-11)

> Ces décisions sont le résultat de la session de brainstorming + panel d'experts ci-dessous.
> Elles priment sur les recommandations du panel quand il y a divergence.

### Architecture retenue : PML standalone pré-configuré par capability

**Rejet de l'Option A (manifeste + cloud fetch)** : Le manifeste de 5 KB qui fetch le DAG depuis le cloud à chaque exécution est rejeté. Les capabilities qui ont besoin d'accès filesystem (read_file, scan codebase, audit docs) ne fonctionnent pas en mode HTTP distant. La valeur est dans l'exécution locale.

**Architecture choisie** : Le package PML est compilé avec la capability et toutes ses dépendances **pré-intégrées au build time**. C'est un binaire autonome qui n'a besoin d'aucune connexion réseau pour fonctionner.

### Principes de build

1. **Pré-fetch de la capability** — Le DAG complet (code, steps, metadata) est embarqué dans le binaire au moment de la compilation. Pas de fetch runtime vers le registry.

2. **Pré-compilation des dépendances stdio** — Les MCP servers stdio requis par la capability (ex: filesystem, git) sont compilés et bundlés dans le package. Les dépendances HTTP restent des URLs externes (pas besoin de les compiler).

3. **Pas d'authentification requise** — Le package fonctionne sans clé API, sans compte, sans rien. L'utilisateur installe et ça marche immédiatement.

4. **Traces désactivées par défaut** — En mode standalone, aucun phone home, aucune télémétrie, aucun envoi de données. Le package est 100% offline-capable.

5. **Mécanismes d'approbation conservés sélectivement** :
   - **Tool permissions** : conservées (l'utilisateur peut contrôler quels outils sont autorisés)
   - **Integrity check (hash FQDN)** : ne se déclenchera pas car le hash embarqué correspond toujours au code embarqué — pas de divergence possible
   - **HIL checkpoints** : conservés là où ils ont du sens pour la sécurité

### Stratégie "Trojan Horse" — Unlock progressif

Le package standalone est un **cheval de Troie bienveillant** :

1. **Phase 1 — Standalone gratuit** : L'utilisateur installe depuis la marketplace pour une capability spécifique. Ça marche out-of-the-box, pas de compte requis.

2. **Phase 2 — Découverte PML** : L'utilisateur réalise que le binaire est PML, qu'il y a d'autres capabilities disponibles. La doc/CLI mentionne `pml discover`.

3. **Phase 3 — Unlock avec clé API** : Si l'utilisateur ajoute une clé PML API (variable d'environnement ou config), le package **active automatiquement** :
   - Connexion au serveur PML (registry, traces, billing)
   - Accès à toutes les capabilities du catalogue
   - Traces d'exécution (mode metadata-only, jamais les arguments)
   - Métriques et dashboard

> **Le binaire est le même** — seul le mode change. Pas de téléchargement supplémentaire, pas de version "pro". La clé API déverrouille les fonctionnalités serveur du binaire déjà installé.

### Distribution marketplace

- **3-5 capabilities max** par marketplace (pas de flooding)
- Chaque listing est fonctionnellement distinct (audit sécurité, query DB, scan codebase, etc.)
- Le binaire fait ~87 MB (runtime Deno inclus) — acceptable pour un outil CLI
- Priorité : **Smithery** (0% commission, stdio natif), puis Glama, puis npm

---

## Contexte

La strategie evaluee : **distribuer les capabilities PML sous forme de MCP servers standalone sur les marketplaces MCP existantes** (Smithery, Glama, Cloudflare Workers, Apify, Composio, OpenTools).

L'hypothese est que les marketplaces MCP peuvent servir de canal de distribution complementaire au modele de consulting direct (valide lors du Panel #1). L'objectif n'est PAS de remplacer le consulting, mais de creer un **funnel marketing** : les developpeurs decouvrent PML via des tools gratuits sur les marketplaces, puis migrent vers la plateforme PML complete pour les workflows avances.

### Lien avec le Panel #1

Le Panel #1 (2026-02-11) a conclu que PML devait d'abord se prouver comme service de consulting direct. Ce Panel #2 explore un canal de distribution COMPLEMENTAIRE qui peut coexister avec cette strategie, a condition d'etre execute a faible cout.

---

## Architecture Proposee

### Constat du tech-architect : le binaire compile par capability est SUBOPTIMAL

Le binaire PML compile avec `deno compile` fait **87 MB** (Linux x64), dont ~80 MB sont le runtime Deno V8 et la standard library. Le code PML specifique ne represente que ~7 MB. Compiler 1 binaire par capability produirait **87 MB de redondance par capability** (N x 87 MB pour N capabilities).

### Architecture recommandee : "PML Runtime + Capability Manifeste"

Au lieu de "1 binaire compile par capability", le tech-architect recommande :

**Option A (RECOMMANDEE)** : 1 binaire PML generique (87 MB, installe une seule fois) + N manifestes de capability (5 KB chacun, distribues sur les marketplaces).

```
UTILISATEUR                                 MARKETPLACE
+---------------------------+               +---------------------------+
| Machine locale            |               | Smithery / Glama / npm    |
|                           |  telecharge   |                           |
| pml (87 MB, deja installe)|<--- manifeste-| capability-manifeste.json |
|                           |   (5 KB)      | (5 KB, listing marketplace)|
| $ pml serve               |               +---------------------------+
|   --manifest=db-query.json|
|   --port=3004             |
|                           |
+----------+----------------+
           |
           | HTTPS (DAG fetch + tracing)
           v
+----------------------------------+
|      PML Cloud (casys.ai)        |
|  - Code DAG (fetch a chaque exec)|
|  - Integrity check (sha256)      |
|  - Trace collection              |
|  - Auth / metering               |
+----------------------------------+
```

**Manifeste de capability** (exemple) :
```json
{
  "name": "database-query",
  "version": "1.0.0",
  "fqdn": "casys.pml.database.query.a1b2",
  "tool": {
    "name": "query_database",
    "description": "Execute SQL queries",
    "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } } }
  },
  "mcpDeps": [],
  "envRequired": ["DATABASE_URL"],
  "cloudUrl": "https://pml.casys.ai"
}
```

### Option B : BYOH (URL-Based) pour Smithery

Pour le prototype Smithery, une approche encore plus simple : PML Cloud expose directement un endpoint MCP HTTPS par capability. On donne l'URL a Smithery qui proxie.

```
SMITHERY                          PML CLOUD
+-------------------+  proxie     +---------------------------+
| Listing Smithery  |  -------->  | https://pml.casys.ai/mcp/ |
| (URL-based BYOH)  |             |   capability/db-query     |
+-------------------+             +---------------------------+
```

Pas de binaire, pas de Docker, pas de manifeste. Le plus simple possible pour un prototype.

### Option C : Docker (pour registre officiel ou Smithery Hosted)

```dockerfile
FROM denoland/deno:latest
COPY capability-manifeste.json /app/
WORKDIR /app
# Thin client : delegue tout a PML Cloud
# Pas de ONNX/libvips (pas d'embeddings locaux)
ENTRYPOINT ["deno", "run", "--allow-net", "--allow-read", "main.ts"]
```

### Mecanismes existants reutilisables (audit du tech-architect)

Le tech-architect a audite le code PML et confirme que la majorite de l'infrastructure necessaire **existe deja** :

| Mecanisme | Etat | Fichier cle | A faire pour standalone |
|---|---|---|---|
| **Tool subsetting** (routing hybride client/server) | Existant | `resolver.ts:99-118` | Rien (routing par namespace fonctionne) |
| **DAG fetching securise** (HTTPS + integrity hash) | Existant | `serve-command.ts:441-479` | Fetch direct par FQDN au lieu de discover |
| **mcpDeps** (deps MCP externes stdio) | Existant | `dep-installer.ts`, `types.ts:136-173` | Rien (install auto + HIL + BYOK) |
| **Sandbox isole** (permissions: "none") | Existant | `sandbox-script.ts:1-12` | Rien |
| **Integrity check** (sha256 lockfile) | Existant | `types.ts:96` | Rien |
| **Mise a jour DAG** (detection divergence + HIL) | Existant | `types.ts:436-437` | Ajouter `pml update` proactif |
| **Auth (API key)** | Existant | `serve-command.ts:118-131` | Via `.env` + `PML_API_KEY` |
| **Auth (OAuth)** | Spec existante | `tech-spec-oauth2-bearer-auth.md` | Non necessaire pour MVP |
| **Routing granulaire par tool** | MANQUANT | `resolver.ts` | Ajouter routing `namespace:action` (evolutif) |

**Point d'attention** : Les mcpDeps stdio necessitent Node.js/npx sur la machine de l'utilisateur. C'est un prerequis implicite a documenter.

---

## Analyse par Plateforme

### Tier 1 — Prioritaire

| Plateforme | Modeles de publication | ToS publisher | Commission | Faisabilite PML |
|---|---|---|---|---|
| **Smithery** | 3 modes : (1) URL-Based BYOH (soumettre une URL HTTPS, Smithery proxie), (2) Smithery Hosted (128MB RAM, 30s CPU, pas de modules natifs), (3) Local/Stdio via mcpb | Pas de ToS formels trouves, publication semble automatique, pas de review process documente | Pas de commission (gratuit) | **HAUTE** — mode BYOH ideal (PML sert le MCP endpoint, Smithery proxie). Precedent : OpenAPI MCP Proxy fait exactement ce pattern. |
| **Registre officiel MCP** | server.json standardise. Packages : NPM, PyPI, Docker/OCI, MCPB. Namespace : domaine (DNS TXT Ed25519) ou GitHub OAuth. | MCPB (binaires) = **GitHub/GitLab releases UNIQUEMENT, PAS de domaines perso**. Hash SHA-256 obligatoire. | Gratuit (open) | **MOYENNE** — Docker/NPM OK. MCPB bloquant si distribution depuis pml.casys.ai (solution : heberger sur GitHub releases). |
| **Glama** | GitHub-based, listing automatique | Pas de restrictions explicites | Gratuit | **HAUTE** — listing automatique depuis GitHub |

### Tier 2 — A explorer

| Plateforme | Modele | Restrictions notables | Faisabilite PML |
|---|---|---|---|
| **Apify** | Actors (Docker), PPE, 36K+ devs/mois, template `ts-mcp-proxy` | **Promotion externe INTERDITE** ("Not allowed to directly or indirectly offer, link to, or otherwise promote any product or service outside of the Platform"). Paiement exclusivement via Apify. Code source inspectable par Apify. | **MOYENNE** — clause promo externe risquee pour le funnel marketing vers casys.ai. Mais pattern "Actor qui appelle API backend" = courant (tous les scrapers le font). |
| **MCPize** | SDK/CLI Python/TS, One-Click Deploy, Gateway API | Revenue share 85%/15%. 500+ serveurs. ToS non accessibles en detail. | **MOYENNE** — commission 15% acceptable, mais plateforme moins mature |
| **dotMCP** | Edge workers sandboxes, tunnel daemon pour serveurs locaux, visual builder | Pas de restrictions explicites. Le modele "tunnel vers serveur distant" est un use case PREMIER de dotMCP. | **MOYENNE** — modele tunnel natif = bon fit, mais plateforme naissante |

### Tier 3 — A surveiller

| Plateforme | Modele | Note |
|---|---|---|
| **Cline Marketplace** | Soumission via GitHub Issue, review en "couple of days" (adoption, credibilite, maturite, securite). Logo 400x400 PNG obligatoire. | Review manuelle mais pas de restrictions sur le comportement interne |
| **Cloudflare** | PAS une marketplace tierce — Cloudflare publie SES PROPRES servers. Deploiement sur Workers possible mais pas de soumission de serveurs tiers dans leur catalogue. | Pas un canal de distribution, mais infra de deploiement |

### Precedents importants (valides par le marketplace-researcher)

| Precedent | Plateforme | Pattern | Pertinence PML |
|---|---|---|---|
| **OpenAPI MCP Proxy** (@JacerOmri) | Smithery | MCP server qui proxie vers n'importe quelle API REST distante | **Identique** au pattern PML. Accepte sans probleme. |
| **mcp-proxy** (sparfenyuk) | Multi | Bridge stdio/SSE vers serveurs distants. Tres populaire. | Valide le pattern "proxy vers backend" |
| **MCPBundles** (thinkchainai) | Hub tiers | Chaque bundle obtient une URL hub, se connecte a un serveur distant | Pattern "hub + phone home" deja en production |
| **Zapier Developer Platform** | Zapier | "Submitting multiple integrations that are essentially the same delays the process and risks rejection of all." | **ATTENTION** : chaque listing DOIT etre fonctionnellement distincte |

### Recommandation plateforme

**Commencer par Smithery en mode BYOH (URL-Based)** : le plus simple (on fournit juste une URL HTTPS, Smithery proxie). Pas besoin de Docker au stade prototype. Le precedent OpenAPI MCP Proxy valide le pattern. Pas de commission, pas de review process.

---

## Conformite ToS / Reglementation

### Analyse ToS par plateforme

| Plateforme | Wrappers/proxies ? | Phone home / fetch distant ? | Listings multiples ? | Promotion externe ? | Risque ToS |
|---|---|---|---|---|---|
| **Smithery** | Oui (precedent: OpenAPI MCP Proxy) | Pas de restriction explicite | Pas de restriction documentee | Pas de restriction | **FAIBLE** |
| **Registre officiel MCP** | Oui | Pas de restriction runtime | Oui (FQDN par serveur) | Oui | **FAIBLE** (sauf MCPB = GitHub/GitLab only) |
| **Glama** | Oui | Oui | Oui | Oui | **FAIBLE** |
| **Apify** | Oui (Actors) | Oui (courant pour scrapers) | Oui MAIS distinctes | **INTERDITE** — "Not allowed to promote any product or service outside of the Platform" | **MOYEN** — clause promo externe |
| **MCPize** | Oui | Non documente | Non documente | Non documente | **MOYEN** — ToS non accessibles |
| **dotMCP** | Oui (tunnel natif) | Pattern premier de la plateforme | Non documente | Non documente | **FAIBLE** |
| **Cline** | Oui | Review manuelle (securite) | Non documente | Non documente | **FAIBLE** |

### Constats cles du marketplace-researcher

1. **Aucune marketplace ne mentionne explicitement une politique sur le "phone home"** (fetch de config distante au runtime).
2. **Aucune marketplace n'interdit les binaires qui envoient des traces/telemetrie.**
3. **Le pattern "MCP server qui proxie vers un backend distant" est COURANT et ACCEPTE** sur toutes les plateformes.
4. **La securite est une preoccupation croissante** (MCP Jail, firewalls, permissions Apify) mais aucune restriction formelle n'empeche le modele PML.

### Precedents de ban/sanctions et incidents securite

Le marketplace-researcher a identifie **5 incidents securite documentes** sur l'ecosysteme MCP :

| Incident | Date | Plateforme | Type | Issue |
|---|---|---|---|---|
| **postmark-mcp** | Sept. 2025 | npm | Package malveillant, vol d'emails | 1,643 dl, RETIRE de npm |
| **mcp-remote CVE-2025-6514** | 2025 | npm | RCE CVSS 9.6 | 437K+ dl, corrige (pas retire) |
| **Anthropic Git MCP Server** | Dec. 2025 | Officiel | 3 vulns, outil `git_init` supprime | Corrige par Anthropic |
| **Smithery path traversal** | 2025 | Smithery | 3,000 serveurs exposes | Corrige par Smithery |
| **Asana MCP integration** | Juin 2025 | Asana | Fuite de donnees clients | Integration retiree 2 semaines |

**Aucun de ces incidents ne concerne le pattern "proxy vers backend distant".** Les bans/retraits concernent du code malveillant (vol de donnees), des RCE involontaires, ou des fuites de donnees. Le pattern PML (fetch de workflow, execution locale, envoi de traces) est fonctionnellement identique aux MCP servers qui appellent une API externe -- la majorite d'entre eux.

**Le vrai risque futur** : un changement de politique anti-"phone home" motive par les preoccupations securite croissantes. Docker a publie "MCP Horror Stories: The Supply Chain Attack" en 2026. Mais pour l'instant, aucune marketplace n'a introduit de restriction sur les appels reseau sortants.

Sources : The Hacker News, Dark Reading, SC World, Data Science Dojo, Docker Blog.

### Risque specifique "proxy vers backend payant"

Le modele "serveur gratuit sur marketplace qui appelle un backend payant" est courant dans le SaaS (cf. extensions Chrome gratuites avec backend payant, plugins WordPress freemium). **Aucune marketplace MCP identifiee n'interdit explicitement ce modele.** Plusieurs precedents valident ce pattern (OpenAPI MCP Proxy, mcp-proxy, MCPBundles). Cependant, ce risque doit etre surveille car les ToS peuvent evoluer.

### Restriction BLOQUANTE : Registre officiel MCP + MCPB

**Les MCPB (binaires pre-compiles) sont restreints aux GitHub/GitLab releases UNIQUEMENT.** Pas de distribution depuis `pml.casys.ai`. **Solution** : heberger les releases binaires sur le repo GitHub `Casys-AI/casys-pml` (deja utilise pour `pml upgrade`). Cette restriction ne concerne PAS les distributions Docker/NPM, ni le mode BYOH Smithery.

### Risque ToS providers LLM (Anthropic, OpenAI)

Le business-strategist souleve un risque NON TRIVIAL : les capabilities PML utilisent des LLM (Opus 4.6, gpt-5-mini) via leurs API. Publier ces capabilities sur une marketplace revient potentiellement a **revendre l'acces API** sous forme de service. Les ToS des providers LLM interdisent generalement la "revente" directe d'acces API.

**Distinction critique** :
- **INTERDIT** : un wrapper qui expose directement `claude.messages.create()` comme un tool MCP
- **AUTORISE** : un service qui UTILISE l'API pour produire un resultat metier (audit, rapport, analyse)

PML se situe dans la zone AUTORISEE car les capabilities ne sont pas un simple proxy vers l'API LLM — elles executent un DAG de 15-40 etapes avec du code, des outils MCP, du tracing, et du post-traitement. Le LLM est un COMPOSANT, pas le PRODUIT.

**Action requise** : Verifier explicitement les ToS Anthropic et OpenAI AVANT publication sur une marketplace.

### Risque securite "Trojan Horse" (rapport Kaspersky 2026)

Le rapport Kaspersky Securelist de 2026 documente des attaques supply chain via MCP servers malveillants. 43% des serveurs MCP analyses sont vulnerables a l'injection de commandes. Un binaire opaque qui phone home vers un serveur central (`pml.casys.ai`) est EXACTEMENT le profil d'un outil suspect pour les equipes securite.

**Mitigation obligatoire** :
- Code source du serveur marketplace en open-source (pas de binaire opaque)
- Documentation complete du flux reseau (quelles donnees sont envoyees, pourquoi)
- Audit de securite publie et accessible
- Transparence dans le listing marketplace ("Powered by PML, code source : [lien]")

### Recommandation ToS

- Lire attentivement les ToS de Smithery avant publication
- **Verifier les ToS Anthropic/OpenAI** sur la revente d'acces API vs utilisation dans un service
- Documenter le modele "free preview + backend PML" de maniere transparente
- Ne PAS cacher que le serveur appelle PML Cloud (transparence)
- **Publier le code source** du serveur marketplace en open-source
- Prevoir un plan B (self-hosted) si les ToS changent

---

## Faisabilite Technique

### Effort de prototypage (validation d'hypothese)

**Revelation du tech-architect** : Le `serve-command.ts` existant fonctionne DEJA comme serveur MCP HTTP. Il suffit de le deployer tel quel dans un Docker et d'ajouter ~20 lignes pour filtrer `tools/list` (n'exposer qu'une seule capability au lieu des 3 tools generiques PML). **Effort reel : ~2h.**

**Option 1 : Docker avec code existant (~2h)**

```dockerfile
FROM denoland/deno:2.1.0
WORKDIR /app
COPY packages/pml/ ./
RUN deno cache src/cli/mod.ts
ENV PML_API_KEY=xxx
ENV PML_CLOUD_URL=https://pml.casys.ai
EXPOSE 3004
CMD ["deno", "run", "-A", "--unstable-worker-options", "src/cli/mod.ts", "serve", "--port", "3004"]
```

Ce qui fonctionne deja sans modification :
- Serveur HTTP MCP sur port 3004 (`serve-command.ts:109-531`)
- Forward vers PML Cloud (`forwardToCloud()` dans `cloud-client.ts:25-67`)
- Execution locale du code retourne (`execute_locally` path, lignes 441-479)
- TraceSyncer asynchrone (lignes 186-194)
- Auth via `PML_API_KEY` en variable d'env

Ce qu'il faut modifier (~20 lignes) :
- Filtrer `tools/list` pour n'exposer qu'UN tool specifique au lieu de discover/execute/admin (`serve-command.ts:330-335`, remplacer `PML_TOOLS` par tableau filtre)

| Composant | Effort | Description |
|---|---|---|
| Docker avec `serve-command.ts` existant | 1h | Zero dev, config Docker + env vars |
| Filtre `tools/list` (20 lignes) | 1h | Exposer 1 capability au lieu de 3 tools generiques |
| Listing Smithery | 0.5h | Push Docker image ou soumettre URL BYOH |
| **Total prototype** | **~2-3h** | Code existant reutilise a 99% |

**Option 2 : BYOH Smithery (encore plus simple)**

Si PML Cloud expose deja un endpoint MCP HTTPS (ce qui est le cas via `serve-command.ts`), on peut simplement donner l'URL a Smithery. Zero Docker.

| Composant | Effort | Description |
|---|---|---|
| Endpoint MCP sur pml.casys.ai | 0h | Deja existant |
| Filtre tools/list pour 1 capability | 1h | 20 lignes dans serve-command.ts |
| Listing Smithery BYOH | 0.5h | Soumettre l'URL, configurer smithery.yaml |
| **Total prototype BYOH** | **~1.5h** | Le plus simple possible |

### Effort de production (apres validation)

| Composant | Effort | Description |
|---|---|---|
| Format manifeste capability (JSON schema) | 1 semaine | Schema du manifeste + validation |
| Sous-commande `pml serve --manifest` | 1-2 semaines | Variante de serve-command.ts existant |
| CLI `pml publish` | 2-3 semaines | Automatise le packaging manifeste + push marketplace |
| Routing granulaire `namespace:action` | 1 semaine | Ajouter routing par tool individuel (pas juste par namespace) |
| Metering par marketplace | 1 semaine | Compteurs d'usage par source |
| **Total production** | **6-8 semaines** | Apres validation du prototype |

**Note du tech-architect** : Le tool subsetting et l'OAuth ne necessitent PAS de dev supplementaire car les mecanismes existants (routing hybride, API key .env) sont suffisants. L'effort de production est reduit par rapport a l'estimation initiale grace a la reutilisation du code existant.

### Challenges techniques identifies (confirmes par le tech-architect)

| # | Challenge | Etat | Risque | Details |
|---|---|---|---|---|
| 1 | **DAG fetching at runtime** | RESOLU — `forwardToCloud()` dans `cloud-client.ts:46-55` fait deja ca. `CapabilityLoader` cache le code fetch (`codeCache` dans `capability-loader.ts:208`). | FAIBLE | Les marketplaces MCP hebergent des serveurs qui appellent des API externes par nature (Tavily, GitHub, etc.). Bloquer les appels sortants rendrait la majorite des serveurs inutiles. |
| 2 | **Tool subsetting** | RESOLU — filtrer `PML_TOOLS` dans `serve-command.ts:330-335` (~20 lignes). | FAIBLE | Routing par namespace existe. Routing par `namespace:action` = evolution future. |
| 3 | **Tracing distribue** | RESOLU — `TraceSyncer.flush()` envoie en POST asynchrone vers `pml.casys.ai/api/traces`. N'ajoute PAS de latence (appele apres retour du resultat MCP). | FAIBLE technique, MOYEN reglementaire | Risque GDPR : les traces contiennent les arguments des tool calls. Le `sanitizer.ts` redacte les donnees sensibles. Prevoir mode "tracing local only" pour conformite. |
| 4 | **Deps natives** | NON APPLICABLE — `packages/pml/` n'a aucune dep native (Cliffy, Hono, AJV = tous pur JS). Les deps natives sont dans les `mcpDeps` stdio, qui sont installes dynamiquement. | ZERO | En Docker, pre-installer Node.js + npm si des mcpDeps sont necessaires. |
| 5 | **Latence** | ACCEPTABLE — cache local + fetch asynchrone. | FAIBLE | Cold start = 1 fetch HTTPS. Executions suivantes = cache local. |
| 6 | **Protection IP** | RESOLU — code jamais embarque, fetch + sha256 integrity + sandbox `permissions: "none"`. | FAIBLE | Meme si le code est intercepte en transit (MITM), le sandbox isole l'execution. |
| 7 | **Sandbox reseau strict** | MITIGEABLE — prevoir un mode "code embarque" (~50 lignes) pour les marketplaces qui bloqueraient les appels sortants. Le code serait emballe dans le Docker au build-time. | FAIBLE | Peu probable que les marketplaces bloquent les sortants, mais bon d'avoir un fallback. |
| 8 | **Conformite GDPR/DPA** | A TRAITER — les traces envoyees a PML Cloud contiennent potentiellement des donnees utilisateur. | MOYEN | Prevoir toggle `PML_TRACING=local` pour desactiver l'envoi au cloud. Mode standalone existant dans `TraceSyncer` (lignes 79-84). |

---

## Modele Business

### Modele a 3 faces (revision business-strategist)

Le business-strategist a revise son analyse initiale et propose un modele a **3 faces** avec des produits, canaux et pricing DISTINCTS par persona :

| Face | Persona | Produit | Canal | Pricing |
|---|---|---|---|---|
| **1. Developpeur MCP** | Dev full-stack, 25-40 ans, Claude Code/Cursor | PML runtime + outils techniques gratuits | Marketplaces (Smithery, Glama) | Gratuit / freemium |
| **2. Consultant technique** | Consultant IT/data/n8n | PML comme plateforme de publication de SES capabilities | pml.casys.ai direct | Commission 15-20% sur ses ventes |
| **3. Client entreprise (ETI)** | DSI / Direction, 35-55 ans, budget 5K-50K EUR | Capabilities consulting packagees | Vente directe + playground | 500-2000 EUR/mission |

**Point critique du business-strategist** : Ces trois personas n'ont RIEN en commun. Essayer de les adresser avec le meme produit est une erreur strategique. Les marketplaces MCP ne sont pertinentes QUE pour la face "developpeur", qui est le funnel d'acquisition le moins cher mais aussi le moins monetisable directement.

### Strategie funnel marketing

Le modele qui a fonctionne pour Notion, Figma, Slack :

```
Marketplace (gratuit, visibilite)
  -> Installation PML / decouverte du playground
    -> Capabilities premium payantes (vente directe, pas via marketplace)
```

**Conditions de succes du funnel** (business-strategist) :
1. L'experience gratuite doit etre EXCELLENTE (pas un teaser frustrant)
2. Le chemin gratuit -> payant doit etre FLUIDE (pas de changement de canal)
3. La version gratuite demontre la valeur SANS la donner entierement

### Strategie de segmentation "trailer vs film"

**Sur les marketplaces** (le TRAILER) :
- "KM Quick Scan" : analyse 10 documents, score + 3 recommandations. Gratuit.
- Outils atomiques (1-3 etapes), capabilities techniques generiques
- Version "preview" limitee

**Sur PML directement** (le FILM) :
- "KM Full Audit" : analyse 500 documents, rapport 40 pages, suivi mensuel. 500 EUR/execution.
- Workflows complexes (15-40 etapes), tracing/HIL complet
- Version complete avec support consultant

### Risque de cannibalisation

**Risque GERABLE** selon le consensus des experts apres confrontation. Le business-strategist a nuance sa position initiale :

- Le risque de cannibalisation n'existe que si on met le MEME produit sur les deux canaux
- Si on segmente (trailer vs film), la marketplace devient un entonnoir de conversion, pas un concurrent
- Le scenario Amazon (marketplace capte la relation client) est gerable car PML controle l'execution cote serveur
- **Regle absolue** : les capabilities marketplace sont des PREVIEWS, les workflows complets restent exclusifs a PML direct

### Commission marketplace (verifie par le marketplace-researcher)

| Plateforme | Modele de monetisation | Commission | Risque pour PML freemium |
|---|---|---|---|
| **Smithery** | Plans publisher (Hobby gratuit, Pro, Custom). Monetisation via hebergement, PAS via commission sur utilisation. | **0%** | **AUCUN** — serveur gratuit + backend payant = no problem |
| **Registre officiel MCP** | Registre ouvert, pas de modele commercial | **0%** | **AUCUN** |
| **Glama** | Gratuit actuellement | **0%** | **AUCUN** |
| **MCPize** | Revenue share sur serveurs payants | **15%** (85% dev) | **FAIBLE** — si serveur gratuit, pas de rev share |
| **Apify** | Pay-per-event via `Actor.charge()` | **20%** sur profits | **MOYEN** — clause anti-paiement externe + anti-promotion externe. Un serveur gratuit redirigeant vers PML payant pourrait violer les clauses. |

**Point cle** : Pour Smithery et le registre officiel (nos cibles prioritaires), le modele freemium avec backend PML payant ne pose **aucun probleme de commission**. Le risque est concentre sur Apify (a eviter pour le MVP).

**Attention business-strategist** : les commissions sont tenables mathematiquement mais le CONTEXTE marketplace tire le prix vers le bas. Le top des earnings Apify = "plus de 2000 EUR/mois". C'est un modele de VOLUME, pas de VALEUR. D'ou la recommandation de garder les marketplaces comme canal d'ACQUISITION (gratuit) et PML direct comme canal de MONETISATION (premium).

### Strategie de pricing recommandee (PPE)

Le business-strategist recommande le **pay-per-execution (PPE)** comme seul modele viable pour les capabilities consulting sur marketplace :

| Type | Prix/execution | Justification |
|---|---|---|
| Outil technique (scraping, conversion) | 0.01-1 EUR | Commodity, forte competition |
| Analyse basique (resume, extraction) | 1-10 EUR | Valeur moderee, reproductible |
| Audit/diagnostic metier | 50-200 EUR | Expertise consulting, DAG complexe |
| Rapport complet (McKinsey-like) | 200-1000 EUR | Haute valeur, long workflow |

**MAIS** : les marketplaces MCP actuelles n'ont PAS de precedent pour du pricing a 200 EUR/execution. Les utilisateurs s'attendent a du 0.01-1 EUR. Introduire du consulting premium dans un contexte de commodite technique sera un choc culturel. C'est pourquoi le consulting premium doit rester en VENTE DIRECTE.

### Personas acheteurs par canal

| Canal | Persona | Besoin | Willingness to pay |
|---|---|---|---|
| Marketplace MCP | Developpeur (Claude Code, Cursor) | Tester un tool rapidement | Faible (habite au gratuit) |
| PML Direct | DevOps / Tech Lead | Orchestration de workflows | Moyen (50-200 EUR/mois) |
| Consulting | DSI / Direction ETI | Solution cle-en-main | Eleve (1000-5000 EUR/mission) |

---

## Risques et Mitigations

| # | Risque | Severite | Probabilite | Mitigation |
|---|---|---|---|---|
| 1 | **Profil "Trojan Horse"** : un binaire opaque qui phone home vers `pml.casys.ai` ressemble a un vecteur d'attaque supply chain (cf. rapport Kaspersky Securelist 2026 sur MCP servers malveillants, 43% vulnerables a l'injection de commandes). Les equipes securite vont le flaguer. | **CRITIQUE** | Moyenne | Transparence totale : code open-source, documentation du flux reseau, audit securite publie. NE PAS cacher les appels sortants. |
| 2 | **ToS providers LLM** : revendre l'acces API Anthropic/OpenAI sous forme de capability peut violer les Terms of Service. Des cas de ban pour revente d'API existent. | **HAUTE** | Moyenne | Verifier explicitement les ToS Anthropic et OpenAI AVANT publication. Distinguer "revente d'acces" (interdit) vs "service qui utilise une API" (autorise). |
| 3 | **ToS marketplace changent** : une marketplace interdit les appels sortants ou les proxies | Haute | Faible (court terme), Moyenne (long terme) | Plan B self-hosted, multi-marketplace pour diversifier |
| 4 | **Flooding = spam** : publier N listings du meme runtime sous des noms differents est de l'astroturfing. Patterns detectables (meme domaine, meme structure binaire, memes traces). Risque reputationnel si identifie. | **HAUTE** | Haute (si flooding tente) | NE PAS faire de flooding. Publier 3-5 capabilities PREMIUM, bien documentees, sous le nom Casys. Qualite > quantite. |
| 5 | **Mismatch persona** : les acheteurs marketplace MCP sont des developpeurs, PAS des acheteurs de consulting. Le canal ne correspond pas a l'audience cible (ETI). | Moyenne | Haute | Accepter que le canal marketplace sert de VITRINE technique, pas de canal de vente consulting. Le funnel marketing doit etre explicitement mesure. |
| 6 | **Pricing tire vers le bas** : le contexte marketplace tire les prix vers 0.01-10 EUR. Incompatible avec du consulting premium a 200-1000 EUR. | Moyenne | Haute | Separer strictement les canaux : tools techniques gratuits sur marketplace, consulting premium en direct uniquement. |
| 7 | **Protection IP quasi-inexistante** : avec 2-3 executions, un developpeur competent reconstitue 80% du workflow en quelques heures. Les DAGs de 15-40 etapes sont des assemblages de patterns connus, pas des innovations brevetables. | Moyenne | Haute | Accepter que le moat n'est PAS dans les DAGs individuels mais dans la plateforme (ecosystem, amelioration continue via traces, support). Comme n8n avec ses templates publics. |
| 8 | **Latence inacceptable** : l'appel PML Cloud est trop lent pour certains use cases | Basse | Moyenne | Cache DAG cote marketplace, mode hybrid (DAG embarque) |
| 9 | **Cout d'infrastructure** : PML Cloud doit absorber le trafic marketplace | Basse | Moyenne | Rate limiting par serveur marketplace, quotas gratuits limites |

### Analyse de severite par le business-strategist

Le business-strategist souligne que les risques #1 (Trojan Horse), #4 (flooding), et #5 (mismatch persona) sont les plus critiques car ils touchent a la **reputation** et a la **strategie fondamentale**. Un ban pour flooding ou une identification comme vecteur d'attaque supply chain serait potentiellement **fatal** pour une startup naissante dans un marche de confiance.

Le "long tail problem" est egalement signale : sur TOUTES les marketplaces, 90% des listings font moins de 10% du revenu. Les top 1% captent 50%+ du trafic. Sans visibilite organique, une capability noyee parmi 2000+ listings est invisible.

---

## Points de Consensus

Les 3 experts s'accordent sur (apres confrontation et revisions) :

1. **Smithery est la plateforme prioritaire** pour un premier test (la plus mature, mode BYOH simple, pas de commission, precedent OpenAPI MCP Proxy)

2. **Le prototype BYOH est faisable en 1-1.5 jours** (URL HTTPS vers PML Cloud, pas besoin de Docker). Alternative Docker en 2-3 jours si necessaire.

3. **Architecture "Runtime + Manifeste"** au lieu de "1 binaire par capability" : 1 binaire PML (87 MB) + N manifestes JSON (5 KB) — 90% de l'infra existe deja

4. **Le free tier est un BON canal d'acquisition** (consensus revise du business-strategist) : modele Notion/Figma/Slack — version gratuite sur canaux tiers, conversion vers payant sur plateforme propre. A condition que l'experience gratuite soit excellente et le chemin vers le payant fluide.

5. **Modele a 3 faces** (consensus final) : 3 personas totalement differents (developpeur MCP, consultant technique, client ETI), chacun avec un produit, canal et pricing DISTINCT. Les marketplaces ne sont pertinentes QUE pour la face "developpeur".

6. **Segmentation "trailer vs film"** : les capabilities marketplace sont des PREVIEWS (1-3 etapes, gratuit). Les workflows complets (15-40 etapes, premium) restent exclusifs a PML direct. La cannibalisation est gerable par cette segmentation.

7. **NE PAS faire de flooding** (unanimite) : 3-5 listings de qualite, pas 30-100. Le first-mover advantage est sur le POSITIONNEMENT (qualite percue), pas sur le VOLUME.

8. **Pas de precedent de ban** : l'ecosysteme est trop jeune, les marketplaces cherchent a croitre. Le pattern "proxy vers backend distant" est courant et accepte (precedents documentes).

9. **Le tracing est un avantage concurrentiel** : les serveurs MCP classiques sur les marketplaces ne fournissent PAS de tracing/observabilite, PML peut se differencier la-dessus

---

## Points de Desaccord et Resolution

### Desaccord #1 : Timing — "Premature" vs "First-mover"

- **Business-strategist (position initiale)** : "Le modele marketplace est premature. Il faut d'abord valider le consulting direct avec 3-5 vrais clients."
- **Marketplace-researcher** : "Les marketplaces MCP sont en croissance explosive. 4000+ serveurs, 700K+ usages. La fenetre de tir est maintenant."
- **Business-strategist (position revisee)** : "On peut etre present sur les marketplaces DES MAINTENANT, a condition de ne pas en faire le canal PRINCIPAL. Le free tier change l'equation de risque. MAIS la croissance du nombre de LISTINGS n'est pas la croissance du REVENU PAYANT (cf. GPT Store : millions de GPTs crees, quasi-zero revenu pour les publishers)."

**Resolution** : Consensus final — les deux approches coexistent. Le free tier a faible cout ne ralentit PAS le consulting direct. Le first-mover advantage est sur le POSITIONNEMENT (qualite percue), pas sur le VOLUME. Regle : **pas d'automatisation tant que le prototype n'a pas valide le funnel.**

### Desaccord #2 : Investissement dans le tooling de bundling

- **Tech-architect** : "Il faut construire un tooling de bundling automatise (CLI `pml publish`, tool subsetting, manifest) pour que les consultants puissent publier facilement."
- **Business-strategist** : "Pas de tooling avant validation commerciale. Un Dockerfile hacky suffit."

**Resolution** : Compromis accepte par les deux. Phase 1 = prototype Dockerfile hacky (2-3 jours). Phase 2 = tooling automatise seulement SI le prototype genere du trafic mesurable (>100 installations en 30 jours).

### Desaccord #3 : Cannibalisation du modele direct

- **Business-strategist** : "Si PML publie ses capabilities sur Smithery, les utilisateurs n'ont plus besoin de PML directement. De plus, le contexte marketplace tire le pricing vers le bas (0.01-10 EUR), ce qui est incompatible avec du consulting premium."
- **Tech-architect** : "La marketplace expose des tools atomiques, pas des workflows. La valeur de PML est dans l'orchestration."

**Resolution** : Consensus final — le risque de cannibalisation est FAIBLE car les deux canaux servent des personas differents (developpeurs vs ETI). Cependant, il faut TOUJOURS limiter les tools marketplace a des previews et garder les workflows complets exclusifs a PML direct. Le business-strategist insiste sur la **separation stricte des canaux de pricing** : JAMAIS de capabilities consulting premium sur les marketplaces.

### Desaccord #4 : Strategie "flooding" vs "showcase"

- **Idee initiale du brainstorming** : Publier 30-100 capabilities sur les marketplaces pour maximiser la visibilite
- **Business-strategist** : "C'est de l'astroturfing. Patterns detectables, risque de ban, reputation detruite. Publier 3-5 capabilities PREMIUM sous le nom Casys."

**Resolution** : Le business-strategist est UNANIMEMENT soutenu sur ce point. Le flooding est une strategie a haut risque et faible ROI. L'approche "Purple Cow" (etre remarquable, pas omnipresent) est retenue : 3-5 capabilities de qualite, bien documentees, avec demos video.

### Desaccord #5 : Protection IP des DAGs

- **Tech-architect** : "Le DAG est server-side, le client ne voit que les inputs/outputs. La logique est protegee."
- **Business-strategist** : "Protection illusoire. Avec 2-3 executions, un dev reconstitue 80% du workflow. Le moat n'est PAS dans les DAGs individuels."

**Resolution** : Le business-strategist a raison. L'analogie n8n est pertinente : n8n a 10K+ templates PUBLICS et ca n'a pas tue leur business. Le moat est dans la PLATEFORME (ecosystem, amelioration continue, support), pas dans les workflows individuels. Implication : ne PAS surinvestir dans l'obfuscation des DAGs, investir dans l'experience plateforme.

---

## Recommandations Ordonnees

| # | Action | Delai | Effort | Prerequis |
|---|---|---|---|---|
| 1 | **Prototype : deployer 1 capability PML sur Smithery** | **~2-3h** | Fondateur seul | Aucun |
| | - Option BYOH : donner l'URL HTTPS de PML Cloud a Smithery (~1.5h) | | | |
| | - Option Docker : `serve-command.ts` existant + 20 lignes de filtre tools/list (~2-3h) | | | |
| | - Capability de demo : "KM Quick Scan" (analyse 10 docs, score + 3 recommandations) | | | |
| 2 | **Mesurer l'adoption** (30 jours apres le prototype) | 30 jours | Observation | Prototype deploye |
| | - Combien d'installations / d'appels tools/jour ? | | | |
| | - Combien de visiteurs redirigent vers casys.ai ? | | | |
| | - TraceSyncer fournit deja les metriques d'usage | | | |
| 3 | **Decision GO/NO-GO tooling** | Jour 30 | Decision | Metriques d'adoption |
| | - Si >100 installations : investir dans le systeme de manifestes + `pml publish` | | | |
| | - Si <50 installations : pivoter vers autre canal | | | |
| 4 | **Publier sur Glama en parallele** (si Smithery positif) | 1h | Fondateur | Prototype Smithery OK |
| 5 | **Construire systeme de manifestes + `pml publish`** (si metriques positives) | 6-8 semaines | Dev | Decision GO |
| 6 | **Ajouter toggle GDPR** (`PML_TRACING=local`) | 1 jour | Dev | Si clients entreprise utilisent le listing |

---

## Verdict

### GO CONDITIONNEL — Prototype a faible cout, puis decision data-driven

**Conditions du GO :**

1. **Prototype d'abord** : Deployer 1 capability sur Smithery en 2-3 jours avec un Dockerfile hacky. PAS de tooling automatise.

2. **Mesurer avant d'investir** : Attendre 30 jours de metriques (installations, usages, redirections vers casys.ai). Seuil de succes = 100 installations.

3. **Ne PAS cannibaliser** : Les tools marketplace sont des PREVIEWS. Les workflows complets restent exclusifs a PML direct.

4. **Coexistence avec le consulting** : La strategie marketplace est un CANAL MARKETING complementaire, pas un remplacement du consulting direct (la priorite #1 du Panel #1).

5. **Transparence** : Documenter clairement que le serveur marketplace appelle PML Cloud. Pas de proxy cache.

### Pourquoi pas un NO-GO ?

- L'effort de prototypage est MINIMAL (2-3 jours)
- Le risque ToS est FAIBLE (pas de precedent de ban)
- Le potentiel de visibilite est ELEVE (4000+ serveurs, marche en croissance)
- Le modele free tier + backend payant est PROUVE dans d'autres ecosystemes

### Pourquoi pas un GO complet ?

- Le marche MCP est un marche de DEVELOPPEURS, pas la cible principale de PML (ETI/consultants)
- Le tooling de bundling automatise est COUTEUX (5-8 semaines) et premature sans validation
- La dependance a des plateformes tierces (Smithery) introduit un risque strategique a long terme
- Le consulting direct n'est PAS encore valide (Panel #1 : "chercher 3 clients payants d'abord")

### Analogie

C'est comme publier un plugin gratuit sur le Chrome Web Store pour promouvoir un SaaS payant. Le plugin est une vitrine, pas le produit. Le vrai business reste le SaaS. Mais la vitrine coute presque rien et apporte de la visibilite.

### Modele publisher : Casys vs Consultant

Le business-strategist recommande un modele HYBRIDE :

| Publisher | Publie quoi | Sous quel nom | Canal |
|---|---|---|---|
| **Casys** | Capabilities TECHNIQUES (infra, connecteurs, outils generiques) | Casys / PML | Marketplaces MCP |
| **Consultant** | Capabilities METIER (audit KM, analyse RH, etc.) | Son propre nom | PML Direct, "Powered by PML" |

Casys n'a PAS de credibilite consulting (c'est un editeur logiciel). Les capabilities consulting doivent porter le nom du consultant, comme les boutiques Shopify portent le nom du commercant.

### Recommandation alternative du business-strategist

Si la strategie marketplace devait etre reecrite from scratch :

**Phase 1 (0-3 mois)** : Validation directe du consulting, PAS de marketplace
**Phase 2 (3-6 mois)** : 3-5 capabilities SHOWCASE sur Apify (PPE) + Smithery (gratuit). Sous le nom Casys, transparence totale.
**Phase 3 (6-12 mois)** : Decision informed basee sur les metriques (si marketplace >30% du pipeline → investir, si vente directe domine → marketplace propre, si rien ne marche → pivoter B2B pur).

Le principe directeur : **on ne "flood" pas un marche qu'on ne comprend pas encore. On teste, on mesure, on decide.**

---

*Spike consolide par le rapporteur sur la base des analyses de 3 experts specialises (marketplace, technique, business), apres confrontation croisee et resolution des contradictions. Tous les experts ont ete interroges et mis en confrontation sur les points de desaccord. Mis a jour avec les critiques approfondies du business-strategist (risque Trojan Horse, flooding, ToS LLM, protection IP).*
