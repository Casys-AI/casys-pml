# Section: Hero

**Ordre:** 1
**Composant:** `HeroSection.tsx`
**Émotion:** Curiosité, Émerveillement

---

## Message

| Élément | Contenu |
|---------|---------|
| **Eyebrow** | The Conversational Web Gateway |
| **Titre L1** | The Gateway for the |
| **Titre L2 (accent)** | Conversational Web |
| **Description** | Your apps, accessible from any chat. Build workflows once, use them from Claude, ChatGPT, or your own interface. Observable. Deterministic. Self-hosted. |
| **CTA Primary** | Start Building → #quickstart |
| **CTA Secondary** | Browse Catalog → /catalog |

---

## Pillars (sous les CTAs)

| Icon | Label |
|------|-------|
| `visibility` | Observable |
| `check_circle` | Deterministic |
| `dns` | Self-Hosted |

---

## Illustration : ChatAppEmergence

### Concept Central

> **"Parlez. L'application apparaît."**
> **"Le chat devient l'application."**

**Objectif :** Montrer qu'une VRAIE APPLICATION UI émerge de la conversation. Pas des logs. Pas un workflow textuel. Une interface riche et interactive.

**Le Décideur voit :** "Mes équipes parlent au chat, et l'outil dont ils ont besoin apparaît instantanément."

---

### Ce que l'illustration DOIT montrer

```
┌─────────────────────────────────────────────────────┐
│  FENÊTRE DE CHAT (style Claude/ChatGPT)             │
│  ───────────────────────────────────────            │
│                                                     │
│  [User] "Show me the deployment dashboard"          │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  ╔═══════════════════════════════════════╗  │   │
│  │  ║  🚀 DEPLOYMENT DASHBOARD              ║  │   │
│  │  ╠═══════════════════════════════════════╣  │   │
│  │  ║                                       ║  │   │
│  │  ║  ┌─────────┐  ┌─────────┐            ║  │   │
│  │  ║  │ v2.1.0  │  │ 3/3 pods│            ║  │   │
│  │  ║  │ current │  │ healthy │            ║  │   │
│  │  ║  └─────────┘  └─────────┘            ║  │   │
│  │  ║                                       ║  │   │
│  │  ║  [████████████░░] 87% rolled out     ║  │   │
│  │  ║                                       ║  │   │
│  │  ║  ┌──────────┐  ┌──────────┐          ║  │   │
│  │  ║  │ Rollback │  │ Continue │          ║  │   │
│  │  ║  └──────────┘  └──────────┘          ║  │   │
│  │  ║                                       ║  │   │
│  │  ╚═══════════════════════════════════════╝  │   │
│  │                                              │   │
│  │  L'APPLICATION APPARAÎT DANS LE CHAT        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Le message :** L'utilisateur parle → Une vraie UI interactive apparaît (pas des logs textuels).

---

### Structure de l'Animation

#### Phase 1 : La Conversation (0s → 1.5s)

1. Fenêtre de chat visible (sobre, style terminal/chat)
2. Message utilisateur apparaît avec typing effect :
   > "Show me the deployment dashboard"

#### Phase 2 : L'Application Émerge (1.5s → 4s)

1. Indicateur "thinking..." (0.3s)
2. Une VRAIE UI apparaît dans le chat :
   - Card avec header "Deployment Dashboard"
   - Métriques visuelles (version, pods status)
   - Progress bar animée
   - Boutons interactifs (Rollback / Continue)
3. Animation : slide-up + fade-in + léger scale

#### Phase 3 : Interaction (4s → 6s)

1. Curseur se déplace vers le bouton "Continue"
2. Click simulé → bouton pulse
3. UI se met à jour (progress bar avance, status change)
4. Feedback visuel : "Deployment complete ✓"

#### Hold & Loop (6s → 8s)

1. Hold état final
2. Fade transition vers nouvelle démo (optionnel) ou restart

---

### Exemples de Démos (rotation possible)

| Démo | Requête | UI qui apparaît |
|------|---------|-----------------|
| **Deploy** | "Show me the deployment dashboard" | Dashboard avec progress, boutons rollback/continue |
| **Sales** | "Pull up the sales report" | Mini graphique, KPIs, export button |
| **Meeting** | "Schedule a team sync" | Calendrier, time picker, attendees |
| **Support** | "Show open tickets" | Liste de tickets, filtres, assign button |

**MVP :** Commencer avec une seule démo (Deploy), ajouter les autres plus tard.

---

### Atomic Design Breakdown

#### Atomes

| Atome | Description | Fichier |
|-------|-------------|---------|
| `ChatMessage` | Message dans le chat (user ou assistant) | `atoms/ChatMessage.tsx` |
| `AppCard` | Container de l'app qui apparaît | `atoms/AppCard.tsx` |
| `MetricBox` | Boîte avec métrique (version, status) | `atoms/MetricBox.tsx` |
| `ProgressBar` | Barre de progression animée | `atoms/ProgressBar.tsx` |
| `ActionButton` | Bouton d'action dans l'app | `atoms/ActionButton.tsx` |
| `StatusBadge` | Badge de statut (healthy, warning, error) | `atoms/StatusBadge.tsx` |

#### Molécules

| Molécule | Composition | Fichier |
|----------|-------------|---------|
| `ChatBubble` | Avatar + ChatMessage + timestamp | `molecules/ChatBubble.tsx` |
| `MetricsRow` | Groupe de MetricBox côte à côte | `molecules/MetricsRow.tsx` |
| `ActionBar` | Groupe de ActionButton | `molecules/ActionBar.tsx` |
| `AppHeader` | Icône + titre + status de l'app | `molecules/AppHeader.tsx` |

#### Organismes

| Organisme | Composition | Fichier |
|-----------|-------------|---------|
| `DeploymentApp` | AppHeader + MetricsRow + ProgressBar + ActionBar | `organisms/DeploymentApp.tsx` |
| `ChatWindow` | Liste de ChatBubble + zone d'apparition app | `organisms/ChatWindow.tsx` |
| `ChatAppEmergence` | ChatWindow avec animation d'apparition de l'app | `organisms/ChatAppEmergence.tsx` |

---

### Animation Details

#### Timing Global

- **Durée totale :** 8 secondes
- **Easing :** `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring effect pour l'app)

#### Phase 1 : Message User (0s → 1.5s)

1. Message container slide-in (0s → 0.3s)
2. Texte typing effect char by char (0.3s → 1.2s)
3. Pause (1.2s → 1.5s)

#### Phase 2 : App Emergence (1.5s → 4s)

1. "..." thinking indicator (1.5s → 1.8s)
2. App card slide-up depuis le bas du chat (1.8s → 2.3s)
   - `transform: translateY(20px) → translateY(0)`
   - `opacity: 0 → 1`
   - `scale: 0.95 → 1`
3. Contenu de l'app apparaît séquentiellement :
   - Header (2.3s → 2.5s)
   - Metrics (2.5s → 3s) avec count-up animation
   - Progress bar (3s → 3.5s) avec fill animation
   - Buttons (3.5s → 4s)

#### Phase 3 : Interaction (4s → 6s)

1. Cursor apparaît et se déplace vers "Continue" (4s → 4.5s)
2. Button hover state (4.5s → 4.8s)
3. Click effect (4.8s → 5s)
4. Progress bar complete (5s → 5.5s)
5. Success state : "Deployed ✓" (5.5s → 6s)

---

### Design Tokens

| Token | Valeur | Usage |
|-------|--------|-------|
| `--chat-bg` | `#0c0c0f` | Fond du chat |
| `--chat-border` | `rgba(255,255,255,0.06)` | Bordures |
| `--user-bubble-bg` | `rgba(255,184,111,0.1)` | Message user |
| `--app-bg` | `rgba(255,255,255,0.03)` | Fond de l'app |
| `--app-border` | `rgba(255,184,111,0.2)` | Bordure de l'app |
| `--app-header-bg` | `rgba(255,184,111,0.08)` | Header de l'app |
| `--btn-primary` | `#FFB86F` | Bouton primary |
| `--btn-secondary` | `transparent` | Bouton secondary |
| `--success-color` | `#22c55e` | Vert succès |
| `--progress-fill` | `#FFB86F` | Remplissage progress |

---

### Responsive

| Breakpoint | Comportement |
|------------|--------------|
| `lg+` | Illustration pleine taille à droite |
| `md` | Illustration réduite en dessous |
| `sm` | Chat simplifié, app réduite mais lisible |

---

### Layout : Canvas Split (Design Retenu)

**Concept :** L'illustration montre un contexte de chat avec un dashboard qui s'ouvre en mode "canvas".

```
┌─────────────────────────────────────────────────────────────────┐
│                        ILLUSTRATION                              │
│  ┌──────────────┐  ┌────────────────────────────────────────┐   │
│  │   CHAT       │  │          DASHBOARD (Canvas)        ┌──┐│   │
│  │              │  │                                     │</││   │
│  │  [User]      │  │   ┌─────────┐  ┌─────────┐         └──┘│   │
│  │  "Deploy     │  │   │ Gauge 1 │  │ Gauge 2 │    (coin    │   │
│  │   v2.1"      │  │   └─────────┘  └─────────┘    écorné)  │   │
│  │              │  │                                         │   │
│  │              │  │   ┌─────────────────────────────────┐  │   │
│  │              │  │   │        Timeline Viewer          │  │   │
│  │              │  │   │  ✓ Build  ✓ Test  ⏳ Deploy     │  │   │
│  │              │  │   └─────────────────────────────────┘  │   │
│  └──────────────┘  └────────────────────────────────────────┘   │
│                                                                  │
│  [ 🚀 Deploy ]  [ 📊 Sales ]  [ 🎫 Support ]  [ 🔄 Sync ]       │
└─────────────────────────────────────────────────────────────────┘
```

#### Dimensions

- **Taille globale :** ~600-700px de large (taille tablette)
- **Chat panel :** ~150px de large (compact)
- **Dashboard panel :** ~450-500px de large (zone principale)
- **Hauteur :** ~350-400px

#### Coin Écorné (Code Reveal)

- **Position :** En haut à droite du dashboard
- **Apparence :** Triangle plié avec icône `</>`
- **Hover :** Légère animation de soulèvement
- **Clic :** Flip animation révélant le code MCP

---

### Interaction "Voir le Code"

#### Comportement

1. **État par défaut :** Dashboard visible avec vrais MCP UIs
2. **Hover sur coin écorné :** Légère élévation + cursor pointer
3. **Clic :** Animation flip/peel révélant le code
4. **Re-clic ou clic ailleurs :** Retour au dashboard

#### Animation "Page Peel"

```css
/* Coin écorné */
.corner-peel {
  position: absolute;
  top: 0;
  right: 0;
  width: 50px;
  height: 50px;
  cursor: pointer;
  overflow: hidden;
}

.corner-peel::before {
  content: '</>';
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 10px;
  color: rgba(255,184,111,0.6);
}

.corner-peel::after {
  /* Triangle plié */
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  border-style: solid;
  border-width: 0 40px 40px 0;
  border-color: transparent #1a1a1a transparent transparent;
  filter: drop-shadow(-2px 2px 4px rgba(0,0,0,0.3));
  transition: border-width 0.2s;
}

.corner-peel:hover::after {
  border-width: 0 50px 50px 0;
}

/* Flip du dashboard */
.dashboard-container {
  perspective: 1200px;
}

.dashboard-flipper {
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.dashboard-flipper.flipped {
  transform: rotateY(180deg);
}

.dashboard-front,
.dashboard-back {
  backface-visibility: hidden;
  position: absolute;
  inset: 0;
}

.dashboard-back {
  transform: rotateY(180deg);
}
```

#### Code Affiché (Illustré et Lisible)

Le code doit être :
- **Lisible par tous** : Commentaires explicatifs, étapes claires
- **Crédible pour les devs** : Syntaxe correcte, patterns réels
- **Visuel** : Highlighting, spacing, icônes d'étapes

```typescript
// 🔍 1. Récupérer la dernière release
const release = await mcp.github.get_release({
  tag: "latest"
});

// 🚀 2. Déployer + Notifier (en parallèle)
const [deploy, notify] = await Promise.all([
  // Déploiement Kubernetes
  mcp.k8s.rolling_update({
    deployment: "api",
    image: `api:${release.tag_name}`
  }),
  // Notification Slack
  mcp.slack.post_message({
    channel: "#ops",
    text: `🚀 Deploying ${release.tag_name}`
  })
]);

// ✅ 3. Retourner le résultat
return {
  version: release.tag_name,
  pods: deploy.ready
};
```

---

### Multi Use-Cases (Démos Switchables)

**Concept :** Plusieurs use-cases avec navigation par pills (comme CodeToUiCarousel).

#### Navigation

- **Pills en bas** de l'illustration
- **Auto-rotation** toutes les 12s
- **Pause** au hover / interaction
- **Reprise** après 20s d'inactivité

#### Démos Disponibles

| ID | Titre | Icône | Requête User | UIs MCP | Tools Affichés |
|----|-------|-------|--------------|---------|----------------|
| `deploy` | Deploy | 🚀 | "Deploy v2.1 to production" | 2x gauge, timeline-viewer | github, k8s, slack |
| `sales` | Sales Intel | 📊 | "Show Q4 sales report" | chart-viewer, table-viewer | salesforce, postgres |
| `monitor` | Monitor | 📈 | "Check server health" | 3x gauge, table-viewer | system_info, pagerduty |
| `sync` | Data Sync | 🔄 | "Sync CRM contacts" | timeline-viewer, gauge | postgres, salesforce |

---

### Vrais MCP UIs

**CRITIQUE :** L'illustration DOIT utiliser de vrais composants MCP Apps avec AppBridge.

#### Pattern (depuis CodeToUiCarousel)

```typescript
// 1. Créer le bridge
const bridge = new AppBridge(
  null,
  { name: "Hero Preview", version: "1.0.0" },
  { openLinks: {}, logging: {} },
  { hostContext: { theme: "dark", displayMode: "inline" } }
);

// 2. Quand initialisé, envoyer les mock data
bridge.oninitialized = () => {
  bridge.sendToolResult({
    content: [{ type: "text", text: JSON.stringify(mockData) }],
    isError: false,
  });
};

// 3. Connecter et charger
const transport = new PostMessageTransport(iframe.contentWindow, iframe.contentWindow);
bridge.connect(transport).then(() => {
  iframe.src = `/api/ui/resource?uri=${encodeURIComponent(resourceUri)}`;
});
```

#### UIs MCP Existantes

| URI | Type | Bon pour |
|-----|------|----------|
| `ui://mcp-std/gauge` | Jauge circulaire | Progress %, CPU, pods count |
| `ui://mcp-std/timeline-viewer` | Timeline verticale | Deploy steps, events |
| `ui://mcp-std/table-viewer` | Tableau données | Deals, tickets, processes |
| `ui://mcp-std/chart-viewer` | Graphiques | Revenue, trends |
| `ui://mcp-std/metrics-panel` | Panel KPIs | Dashboard metrics |
| `ui://mcp-std/sparkline` | Mini graphique | Trends inline |
| `ui://mcp-std/log-viewer` | Logs | Real-time logs |

#### UIs MCP À Créer (Killer Compositions)

| URI proposée | Type | Usage | Priorité |
|--------------|------|-------|----------|
| `ui://mcp-std/status-steps` | Liste ✓/⏳/○ | Deploy steps plus visuel | P1 |
| `ui://mcp-std/kpi-card` | Gros chiffre + trend | Sales KPIs, metrics hero | P1 |
| `ui://mcp-std/alert-banner` | Bandeau warning/success | Monitoring alerts | P2 |

---

### Compositions par Use-Case

#### Deploy 🚀

```
┌────────────────────────────────────────┐
│  2x gauge (side by side)               │
│  ┌─────────┐  ┌─────────┐              │
│  │   87%   │  │  3/3    │              │
│  │ Progress│  │  Pods   │              │
│  └─────────┘  └─────────┘              │
│                                        │
│  timeline-viewer (full width)          │
│  ┌──────────────────────────────────┐  │
│  │ ✓ Build  ✓ Test  ⏳ Deploy       │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

#### Sales Intel 📊

```
┌────────────────────────────────────────┐
│  chart-viewer (bar chart)              │
│  ┌──────────────────────────────────┐  │
│  │  ████ ██████ ████████ ██████     │  │
│  │  Q1   Q2     Q3       Q4         │  │
│  └──────────────────────────────────┘  │
│                                        │
│  table-viewer (top deals)              │
│  ┌──────────────────────────────────┐  │
│  │ Acme Corp    $45k    Closing     │  │
│  │ TechStart    $28k    Proposal    │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

#### Monitor 📈

```
┌────────────────────────────────────────┐
│  3x gauge (CPU, RAM, Disk)             │
│  ┌───────┐  ┌───────┐  ┌───────┐      │
│  │  72%  │  │  58%  │  │  45%  │      │
│  │  CPU  │  │  RAM  │  │  Disk │      │
│  └───────┘  └───────┘  └───────┘      │
│                                        │
│  table-viewer (top processes)          │
│  ┌──────────────────────────────────┐  │
│  │ node api     34%    512MB        │  │
│  │ postgres     28%    1.2GB        │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

---

### Implémentation

#### Fichier Island

`src/web/islands/HeroChatAppIsland.tsx`

#### Responsabilités

- Gérer les états (activeIndex, showCode, isPaused)
- Initialiser AppBridge pour chaque UI MCP
- Gérer l'animation flip du coin écorné
- Auto-rotation des use-cases
- Responsive (stack sur mobile)

---

### Accessibilité

- `aria-label` : "Animation showing an application appearing in a chat conversation"
- `prefers-reduced-motion` : Afficher état final statique
- Tous les textes lisibles avec contraste suffisant

---

### Implémentation Progressive

**Phase 1 :** Atomes (ChatMessage, AppCard, MetricBox, ProgressBar, ActionButton)
**Phase 2 :** Molécules (ChatBubble, MetricsRow, ActionBar, AppHeader)
**Phase 3 :** DeploymentApp (l'app qui apparaît)
**Phase 4 :** ChatWindow (le container chat)
**Phase 5 :** ChatAppEmergence (animation complète)
**Phase 6 :** Animations, polish, responsive

---

## Contenu TypeScript

```typescript
export const hero = {
  eyebrow: "The Conversational Web Gateway",

  title: {
    line1: "The Gateway for the",
    accent: "Conversational Web",
  },

  description:
    "Your apps, accessible from any chat. " +
    "Build workflows once, use them from Claude, ChatGPT, or your own interface. " +
    "Observable. Deterministic. Self-hosted.",

  pillars: [
    { icon: "visibility", label: "Observable" },
    { icon: "check_circle", label: "Deterministic" },
    { icon: "dns", label: "Self-Hosted" },
  ],

  cta: {
    primary: {
      label: "Start Building",
      href: "#quickstart",
    },
    secondary: {
      label: "Browse Catalog",
      href: "/catalog",
    },
  },
};
```

---

## Composant (modifications)

```tsx
// src/web/components/landing-v2/sections/HeroSection.tsx

// Modifier les pillars
const pillars = [
  { icon: "visibility" as const, label: "Observable" },
  { icon: "check_circle" as const, label: "Deterministic" },
  { icon: "dns" as const, label: "Self-Hosted" },
];

// Dans le JSX, modifier :
<h1>
  <span class="block text-stone-100">{hero.title.line1}</span>
  <span class="block text-pml-accent italic">{hero.title.accent}</span>
</h1>
```

---

## Vérification

### Messaging
- [ ] Eyebrow : "The Conversational Web Gateway"
- [ ] Titre complet visible
- [ ] Description mentionne : any chat, observable, deterministic, self-hosted
- [ ] CTA primary : "Start Building"
- [ ] Pillars corrects (3) : Observable, Deterministic, Self-Hosted

### Illustration
- [ ] Phase 1 : Requête visible avec texte naturel
- [ ] Phase 2 : Workflow avec étapes explicites (pas boîte noire)
- [ ] Phase 2 : Checkpoint HIL visible (Approve?)
- [ ] Phase 3 : Résultat avec métriques
- [ ] Animation fluide (8s cycle)
- [ ] `prefers-reduced-motion` respecté
- [ ] Responsive : simplifié sur mobile
