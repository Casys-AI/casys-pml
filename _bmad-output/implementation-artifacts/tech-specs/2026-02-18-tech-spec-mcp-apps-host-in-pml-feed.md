# Tech Spec : MCP Apps Host complet dans le PML Feed

**Date** : 2026-02-18
**Statut** : À planifier
**Priorité** : P2 (nice-to-have pour l'interactivité des viewers industrie)

---

## Contexte

Les viewers ERPNext (et futurs lib/syson, lib/plm) utilisent le SDK complet `@modelcontextprotocol/ext-apps`.
Ce SDK expose `app.callServerTool(name, args)` qui émet un message JSON-RPC `ui/call-tool` vers le host.

Le PML feed (`/feed/live`) sert ces viewers en iframe via `embedViewer()` dans `pml-server.ts`.
Actuellement, `embedViewer()` est un **host partiel** : il gère `ui/initialize` et `ui/notifications/tool-result`, mais **pas `ui/call-tool`**.

Sans `ui/call-tool`, les viewers ne peuvent pas modifier de données → ils sont **read-only**.

### Exemple concret : Kanban order-pipeline-viewer

Le `order-pipeline-viewer` affiche un kanban des Sales Orders ERPNext.
Pour qu'il soit interactif (drag & drop pour changer de statut), il faut :

```typescript
// Dans OrderPipelineViewer.tsx — à implémenter une fois le host prêt
async function moveOrder(orderName: string, newStatus: string) {
  await app.callServerTool("erpnext_sales_order_update", {
    name: orderName,
    data: { status: newStatus }
  });
  // Rafraîchir le kanban
}
```

---

## Ce qui est déjà fait

Dans `packages/pml/src/server/pml-server.ts`, la fonction `embedViewer()` (dans `FEED_LIVE_HTML`) a déjà le handler `ui/call-tool` côté browser qui proxie vers `/call-tool` :

```javascript
if (msg.method === 'ui/call-tool' && msg.id != null) {
  fetch('/call-tool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: msg.params?.name, arguments: msg.params?.arguments ?? {} }),
  })
    .then(r => r.json())
    .then(result => iframe.contentWindow.postMessage({ jsonrpc: '2.0', id: msg.id, result }, '*'))
    .catch(err => iframe.contentWindow.postMessage({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: String(err) } }, '*'));
  return;
}
```

---

## Ce qui reste à faire

### 1. Route HTTP `POST /call-tool` dans `startHttp()` (pml-server.ts)

Ajouter dans `customRoutes` de `startHttp()`, après la route `/ui/*` :

```typescript
{
  method: "post",
  path: "/call-tool",
  handler: async (req: Request) => {
    const { name, arguments: args } = await req.json();

    if (!this.context.loader) {
      return new Response(
        JSON.stringify({ error: "Loader not initialized" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    // Format attendu par CapabilityLoader.call() : "server:tool_name"
    // ou FQDN complet si disponible
    const toolId = name; // le viewer envoie "erpnext_order_pipeline" par ex.

    try {
      const result = await this.context.loader.call(toolId, args ?? {});
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: String(err) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
},
```

**Attention** : `loader.call()` peut retourner `ApprovalRequiredResult` (HIL).
À décider : soit on refuse les call-tool en HIL (simplest), soit on gère l'approval dans le viewer.

### 2. Format du `name` dans `ui/call-tool`

Le SDK envoie `name` tel que défini dans l'appel `app.callServerTool(name, args)`.
Options :
- **Option A** : Le viewer envoie `"erpnext_sales_order_update"` → le feed résout via le loader (nécessite que le tool soit chargé)
- **Option B** : Le viewer envoie `"mcp-erpnext:erpnext_sales_order_update"` (format FQDN-like) → le feed peut router directement
- **Option C** : Le feed injecte le `serverName` dans l'URL de l'iframe → le viewer le lit et préfixe ses calls

Recommandation : **Option B** — le viewer connaît son serveur, il préfixe.

### 3. Drag & Drop dans order-pipeline-viewer

Une fois la route `/call-tool` opérationnelle :

```typescript
// OrderPipelineViewer.tsx
function OrderItemCard({ order, accentColor, currency }: Props) {
  // Drag source
  function onDragStart(e: DragEvent) {
    e.dataTransfer?.setData("text/plain", JSON.stringify({ name: order.name }));
  }

  return <div draggable onDragStart={onDragStart} style={cardStyle}>...</div>;
}

function KanbanColumn({ col, currency }: Props) {
  async function onDrop(e: DragEvent) {
    e.preventDefault();
    const { name } = JSON.parse(e.dataTransfer?.getData("text/plain") ?? "{}");
    if (!name) return;

    await app.callServerTool("mcp-erpnext:erpnext_doc_update", {
      doctype: "Sales Order",
      name,
      data: { status: col.status }
    });
    // TODO: re-trigger erpnext_order_pipeline pour refresh
  }

  return (
    <div onDragOver={e => e.preventDefault()} onDrop={onDrop} style={columnStyle}>
      ...
    </div>
  );
}
```

---

## Considérations

### Sécurité
- Le endpoint `/call-tool` est exposé sans auth sur le feed local → ok pour usage local, **pas pour exposition réseau**
- Un viewer malicieux (si on charge des viewers tiers) pourrait appeler n'importe quel tool → à contraindre par origin ou allowlist de tools

### HIL (Human-in-the-Loop)
- Si `loader.call()` retourne `ApprovalRequiredResult`, que faire ?
- Simple : retourner 403 avec message "Approval required — use PML to approve"
- Complexe : gérer le flow approval dans le viewer (popup de confirmation)

### Refresh après mutation
- Après un drag & drop, le kanban doit se mettre à jour
- L'approche la plus simple : le viewer re-appelle le tool de données (`erpnext_order_pipeline`) via `callServerTool` et met à jour son state local
- Alternative : le feed broadcast un refresh event (complexe)

---

## Effort estimé

| Tâche | Effort |
|-------|--------|
| Route `POST /call-tool` dans startHttp | ~1h |
| Gestion HIL (reject simple) | ~30min |
| Drag & drop dans order-pipeline-viewer | ~2h |
| Tests + rebuild | ~1h |
| **Total** | **~4.5h** |

---

## Fichiers concernés

| Fichier | Changement |
|---------|-----------|
| `packages/pml/src/server/pml-server.ts` | + route `POST /call-tool` dans `startHttp()` |
| `lib/erpnext/src/ui/order-pipeline-viewer/src/OrderPipelineViewer.tsx` | + HTML5 drag & drop |
| `lib/erpnext/src/ui/order-pipeline-viewer/` | rebuild npm run build |
