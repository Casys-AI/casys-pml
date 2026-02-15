# Vision : Orchestration Distribuée pour Agents MCP

**Date :** 2026-02-14
**Origine :** Panel MCP On-Demand + discussion fondateur
**Positionnement :** "The control plane for distributed AI agents"
**Tagline :** "One agent. Many machines. Full control."

## Le problème

Ton agent IA ne voit que ta machine locale. Mais tes ressources sont partout — GPU chez Marc, DB de staging sur un serveur, API Stripe dans le cloud. Personne n'orchestre ça aujourd'hui.

## La solution

PML connecte ton agent à toutes tes machines — de manière sécurisée, tracée et intelligente. L'agent voit un seul catalogue de tools, PML route vers la bonne machine.

## Les 8 piliers de l'orchestration distribuée

### 1. Discovery — "Qu'est-ce qui existe ?"

L'agent voit un catalogue unifié de toutes les capabilities sur toutes les machines. Comme un DNS pour les MCP tools.

- L'agent cherche "embeddings" → PML répond "GPU de Marc, online, 200ms"
- Catalogue centralisé, mis à jour en temps réel quand les machines se connectent/déconnectent
- Versioning des capabilities (v1.2, v2.0)
- **Briques existantes :** `--expose`, `capability-resolver.ts`, `registerToolLive()`, `pml_registry` VIEW

### 2. Routing — "Où j'exécute ?"

Routing intelligent basé sur : disponibilité, capacité, coût, localité. Pas juste round-robin — smart routing.

- "Cette DB est sur la machine A et B, A est surchargée → route vers B"
- Device targeting via `_meta.device` ou `X-PML-Device` header
- Health checks + failover automatique
- **Briques existantes :** `_meta.device` (spécifié dans spike), `TunnelStore.pickTunnel()` (round-robin), device discovery endpoint

### 3. Tracing distribué — "Qu'est-ce qui s'est passé ?"

Un DAG unifié qui montre le parcours cross-machine. Comme Jaeger/Zipkin mais natif MCP.

- Noeud 1 sur `laptop-paris` (50ms) → Noeud 2 sur `gpu-server` (800ms) → Noeud 3 sur `db-staging` (30ms)
- `_meta.device` propagé dans chaque noeud du DAG = distributed tracing natif
- Replay d'exécution cross-machine
- **Briques existantes :** Tracing DAG, `TraceTaskResult` (10+ metadata, `device` à ajouter ~2-3h). Pipeline `_meta.ui` comme modèle.

### 4. Policy engine — "Qu'est-ce qui est autorisé ?"

Règles déclaratives : quel agent, quelle capability, quand, combien. Circuit breakers, rate limits, dry-run.

- "L'agent CI peut lire la DB staging mais PAS écrire en prod entre 22h et 6h"
- Agent allowlist (signature vérifiée)
- Capability ACL (`--expose` = scope explicite)
- HIL (Human-in-the-Loop) pour les actions destructives
- **Briques existantes :** OAuth2/JWT auth, rate limiting, AJV schema validation, HIL, sandbox Worker `permissions: "none"`. Agent allowlist spécifiée (à implémenter, ~2-3j).

### 5. Scheduling — "Quand ça tourne ?"

Agents autonomes planifiés : cron, triggers, événements. Avec monitoring et alerting.

- "Tous les lundis à 8h, l'agent fait le rapport hebdo en utilisant 3 machines"
- Dashboard temps réel des jobs en cours
- Alerting si un agent échoue ou dépasse son timeout
- **Briques existantes :** Aucune. À construire. Le tracing DAG peut servir de base pour le monitoring.

### 6. State & Rollback — "Et si ça foire ?"

Checkpoints, snapshots d'état, rollback automatique. L'agent fait une connerie à 3h du mat → rollback au dernier checkpoint sain.

- "L'agent a modifié 47 fichiers → rollback en 1 clic"
- Checkpoints automatiques avant chaque action destructive
- Diff entre checkpoints (comme git)
- **Briques existantes :** Tracing DAG (liste exacte des actions). Checkpoints/rollback = à construire.

### 7. Agent-to-Agent — "Les agents collaborent"

Un agent qui délègue à un autre agent sur une autre machine. Orchestration multi-agent distribuée.

- L'agent principal demande à l'agent ML de générer des embeddings, puis à l'agent DB de les stocker
- Protocole de coordination entre agents (pas juste tool calls séquentiels)
- DAG d'exécution multi-agent visible dans le tracing
- **Briques existantes :** Le relay tunnel est le transport. Le protocole de coordination = à définir.

### 8. Marketplace — "Partage et monétise"

Catalogue de capabilities versionnées, partagées entre équipes/organisations. Billing intégré.

- L'équipe data publie `ml:embeddings` v2.1, l'équipe backend la consomme, c'est facturé
- Reviews, ratings, usage stats
- Modèle économique : commission sur les transactions ou abonnement
- **Briques existantes :** `--expose` + `--publish`, `code_url` en DB, Smithery BYOH comme canal de distribution initial.

## Architecture en 4 couches

```
┌─────────────────────────────────────┐
│  Marketplace / Catalog              │ ← partager
├─────────────────────────────────────┤
│  Policy / Security / Allowlist      │ ← contrôler
├─────────────────────────────────────┤
│  Routing / Scheduling / State       │ ← orchestrer
├─────────────────────────────────────┤
│  Discovery / Tracing / Relay        │ ← voir
└─────────────────────────────────────┘
         ↕ Relay tunnel (bus) ↕
    ┌──────┐  ┌──────┐  ┌──────┐
    │ PML  │  │ PML  │  │ PML  │
    │ GPU  │  │ DB   │  │ API  │
    └──────┘  └──────┘  └──────┘
```

## Analogies

| PML | Équivalent infra | Ce que ça fait |
|-----|-----------------|----------------|
| Discovery | DNS / Consul | Trouver les services |
| Routing | Envoy / Nginx | Router vers le bon backend |
| Tracing | Jaeger / Zipkin | Suivre les requêtes cross-service |
| Policy | OPA / Istio | Appliquer les règles de sécurité |
| Scheduling | Cron / Temporal | Planifier les exécutions |
| State | etcd / Checkpoint | Gérer l'état distribué |
| Agent-to-Agent | gRPC / Service Mesh | Communication inter-services |
| Marketplace | Docker Hub / npm | Distribuer les composants |

**En résumé : PML = Kubernetes + Istio + Jaeger pour agents MCP.**

## Maturité des briques

| Pilier | État | Effort restant |
|--------|------|----------------|
| 1. Discovery | ~70% (--expose, resolver, registerToolLive) | Catalogue UI, search |
| 2. Routing | ~30% (spécifié dans spike, _meta.device) | Tunnel SSE, smart routing |
| 3. Tracing distribué | ~60% (DAG existe, _meta.device à ajouter) | 2-3h pour _meta.device |
| 4. Policy engine | ~50% (auth, rate limit, HIL, sandbox) | Agent allowlist 2-3j |
| 5. Scheduling | ~0% | À construire |
| 6. State & Rollback | ~10% (tracing = liste d'actions) | Checkpoints à construire |
| 7. Agent-to-Agent | ~0% | Protocole à définir |
| 8. Marketplace | ~20% (--publish, code_url, Smithery) | UI, billing, reviews |

## Décisions du panel (D1-D9)

| # | Décision |
|---|----------|
| D1 | Tracing déjà fait → relay = prochaine priorité |
| D2 | Smithery BYOH = test du relay HTTP |
| D3 | handleJsonRpc = refactor rapide dans lib/server |
| D4 | WebMCP = enrichissement, pas pivot |
| D5 | WebMCP = adapter dans MCP Apps Bridge |
| D6 | Bridge (A) + Connector (B) retenus, effort minimal pour B |
| D7 | Sandbox nécessaire — protège la machine, pas le code |
| D8 | Relay = produit, marché requis |
| D9 | PAS "Sentry pour agents" → Orchestration distribuée intelligente |
