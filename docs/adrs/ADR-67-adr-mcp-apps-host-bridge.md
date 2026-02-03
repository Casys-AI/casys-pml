# ADR: MCP Apps Host Bridge - SDK officiel vs implémentation custom

**Date**: 2026-02-03
**Statut**: Accepté
**Contexte**: Story 16.6 - Composite UI Viewer & Editor

## Contexte

Le `CompositeUiViewer` doit communiquer avec des UI MCP Apps embarquées dans des iframes. Ces UIs utilisent le SDK `@modelcontextprotocol/ext-apps` avec la classe `App` pour recevoir des données via le protocole MCP Apps (JSON-RPC over postMessage).

### Problème initial

Une implémentation custom `McpAppsHostBridge` avait été créée pour gérer la communication host-side. Les UIs affichaient "Loading data..." car :

1. **Protocol version mismatch** : Version hardcodée au lieu de négociation
2. **Race condition** : L'iframe chargeait avant que le bridge soit prêt à écouter
3. **Transport incompatible** : L'implémentation custom ne suivait pas exactement le protocole du SDK

## Décision

**Utiliser le SDK officiel `AppBridge` et `PostMessageTransport`** de `@modelcontextprotocol/ext-apps/app-bridge` au lieu d'une implémentation custom.

### Raisons

1. **Compatibilité garantie** : Le SDK `AppBridge` est conçu pour fonctionner avec `App` côté client
2. **Protocole correct** : Gestion automatique du handshake `ui/initialize` → `ui/notifications/initialized`
3. **Maintenance réduite** : Pas besoin de suivre les évolutions du protocole MCP Apps
4. **Moins de bugs** : Le SDK est testé et maintenu par Anthropic/MCP

## Implémentation

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Host (CompositeUiViewer)                                       │
│  ┌─────────────────┐     ┌──────────────────────────────────┐  │
│  │   AppBridge     │────▶│  PostMessageTransport            │  │
│  │   (SDK)         │     │  (iframe.contentWindow)          │  │
│  └─────────────────┘     └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                    │ postMessage
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  iframe (table-viewer UI)                                       │
│  ┌─────────────────┐     ┌──────────────────────────────────┐  │
│  │   App           │◀────│  PostMessageTransport            │  │
│  │   (SDK)         │     │  (window.parent)                 │  │
│  └─────────────────┘     └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Flux de données

1. **Connexion** :
   ```typescript
   const bridge = new AppBridge(null, hostInfo, capabilities, options);
   const transport = new PostMessageTransport(iframe.contentWindow, iframe.contentWindow);
   await bridge.connect(transport);  // DOIT être complet AVANT de charger l'iframe
   iframe.src = uiUrl;  // Charger l'iframe APRÈS connect()
   ```

2. **Handshake** (géré par SDK) :
   - UI envoie `ui/initialize`
   - Host répond avec capabilities
   - UI envoie `ui/notifications/initialized`
   - `bridge.oninitialized` est appelé

3. **Envoi des données** :
   ```typescript
   bridge.oninitialized = () => {
     bridge.sendToolInput({ arguments: args });
     bridge.sendToolResult({ content: [...], isError: false });
   };
   ```

### Point critique : Timing

```typescript
// CORRECT : Bridge connecté AVANT chargement iframe
bridge.connect(transport).then(() => {
  iframe.src = uiUrl;  // Maintenant seulement
});

// INCORRECT : Race condition
bridge.connect(transport);  // Async, pas attendu
iframe.src = uiUrl;  // iframe charge et envoie initialize AVANT que bridge écoute
```

### Mapping des Tool IDs

Les traces utilisent le format long (`pml.mcp.std.docker_ps.06bd`) mais `tool_schema` utilise le format court (`std:docker_ps`).

Solution : L'API `/api/capabilities/:id/uis` retourne les deux formats :

```typescript
interface CollectedUiResource {
  source: string;   // Format court pour affichage (std:docker_ps)
  toolId?: string;  // Format long pour matching traces (pml.mcp.std.docker_ps.06bd)
  resourceUri: string;
  slot: number;
}
```

## Dépendances

```json
{
  "@modelcontextprotocol/ext-apps": "^1.0.1"
}
```

Import dans `deno.json` :
```json
{
  "imports": {
    "@modelcontextprotocol/ext-apps": "npm:@modelcontextprotocol/ext-apps@^1.0.1",
    "@modelcontextprotocol/ext-apps/app-bridge": "npm:@modelcontextprotocol/ext-apps@^1.0.1/app-bridge"
  }
}
```

## Fichiers modifiés

- `src/web/components/ui/CompositeUiViewer.tsx` - Utilise AppBridge au lieu de McpAppsHostBridge
- `src/web/routes/api/capabilities/[id]/uis.ts` - Ajoute `toolId` long aux CollectedUiResource
- `src/web/islands/CytoscapeGraph.tsx` - Ajoute `toolId` à l'interface CollectedUiResource
- `deno.json` - Ajoute import @modelcontextprotocol/ext-apps

## Fichiers obsolètes

- `src/web/lib/mcp-apps-host-bridge.ts` - Peut être supprimé (implémentation custom remplacée)

## Conséquences

### Positives

- Communication fiable entre host et iframes UI
- Support automatique des futures versions du protocole MCP Apps
- Code plus simple et maintenable

### Négatives

- Dépendance externe supplémentaire (mais c'est le SDK officiel)
- Moins de contrôle sur les détails du protocole (acceptable car on suit le standard)

## Alternatives rejetées

1. **Corriger McpAppsHostBridge custom** : Plus de travail, moins fiable, maintenance continue nécessaire
2. **Communication directe sans SDK** : Réinventer la roue, risque d'incompatibilité

## Références

- [MCP Apps Spec (SEP-1865)](https://modelcontextprotocol.io/docs/concepts/apps)
- [@modelcontextprotocol/ext-apps npm](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps)
