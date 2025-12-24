---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - docs/PRD.md
  - docs/epics.md
  - src/web/routes/index.tsx
workflowType: 'ux-design'
lastStep: 4
project_name: 'Casys PML'
user_name: 'Erwan'
date: '2025-12-07'
---

# UX Design Specification - Casys PML

**Author:** Erwan (avec Sally, UX Designer)
**Date:** 2025-12-07

---

## 1. Discovery Context

### 1.1 Source Documents
- **PRD:** Casys PML Product Requirements Document
- **Epics:** Epic 7-9 (Emergent Capabilities, Hypergraph Viz, Auth Multi-Tenant)
- **Landing Page:** Session redesign 2025-12-07 (Expert Panel: 5.3/10 -> Redesign)

### 1.2 Session Learnings - Landing Page Redesign (2025-12-07)

**Probleme identifie (Expert Panel 5.3/10):**
- Trop de questions, pas assez de preuve
- 3 messages concurrents qui se battent pour l'attention
- Aucun exemple concret visible au-dessus de la ligne de flottaison

**Solution implementee:**
- Hero transforme de "What if workflows emerged?" (question) vers "An agent discovered a pattern. Then another agent used it." (affirmation concrete)
- Layout 2 colonnes: Texte (1fr) + Code snippet "Captured Pattern" (1.2fr)
- Principe "Show, Don't Ask" - preuve visible immediatement

**Decisions techniques:**
- Grid ratio: `1fr 1.2fr` (donne plus d'espace a la preuve visuelle)
- Title size: `clamp(2.25rem, 4vw, 3rem)` (equilibre avec le code snippet)
- Gap: `3rem` (separation claire sans exces)
- Section "The Collective" avec flow de propagation: Discovery -> Capture -> Propagation

---

## 2. Executive Summary

### 2.1 Project Vision

Casys PML transforme la facon dont les agents IA decouvrent et partagent des patterns d'execution. La ou les solutions existantes saturent le contexte LLM avec des schemas statiques, Casys PML capture les workflows emergents - les combinaisons d'outils que les agents decouvrent par l'execution, pas par le design.

**Proposition de valeur UX:** "Zero config, instant value" - un developpeur passe de l'installation a son premier workflow parallelise en moins de 10 minutes.

### 2.2 Target Audience

> **Note:** Casys PML est un **projet de recherche open source**, pas un produit commercial. Les "users" sont des contributeurs, chercheurs, et early adopters curieux.

**Primary Audience: Researchers & AI Enthusiasts**
- Interessés par l'emergence et l'apprentissage collectif des agents
- Veulent experimenter avec des patterns MCP avances
- Contribuent au projet (issues, PRs, discussions)

**Secondary Audience: Power Developers (Early Adopters)**
- Utilisent Claude Code intensivement
- Prêts a tester des solutions experimentales
- Fournissent du feedback pour la recherche

### 2.3 Key Design Challenges

1. **Dual-Mode Authentication** - L'UI doit s'adapter Cloud/Local sans friction
2. **Technical Abstraction** - Rendre accessible DAGs, hypergraphs, embeddings
3. **10-Minute Onboarding** - Power users impatients, valeur immediate requise

### 2.4 Design Opportunities

1. **Visual Proof Pattern** - Montrer les patterns captures avant d'expliquer
2. **Adaptive UI** - Mode cloud riche vs mode local epure
3. **Collective Learning Visualization** - Rendre visible la propagation des patterns

---

## 3. Core User Experience

### 3.1 Defining Experience

**Core Loop:** Execute -> Discover -> Capture -> Propagate
- L'utilisateur interagit avec Claude normalement
- Casys PML intercepte, optimise, parallelise invisiblement
- Les patterns emergents sont captures automatiquement
- Les autres agents (du meme user ou globaux) beneficient des patterns

**Primary Value:** "Le travail d'un agent profite a tous"

### 3.2 Platform Strategy

| Layer | Technology | UX Role |
|-------|------------|---------|
| CLI | Deno binary | Zero-config setup |
| MCP Gateway | SSE + JSON-RPC | Invisible runtime |
| Dashboard | Fresh 2.x | Monitoring & Auth |
| Landing | Fresh 2.x | Marketing & Docs |

**Dual-Mode Architecture:**
- **Cloud:** GitHub OAuth -> Session -> API Key
- **Local:** Zero-auth, user_id="local" automatique

### 3.3 Effortless Interactions

1. **10-Minute Onboarding** (NFR002)
   - `pml init` lit mcp.json existant
   - Migration automatique des 15+ servers
   - Premier workflow parallelise sans config

2. **Invisible Optimization**
   - Context reduction 30-50% -> <5% (aucune action user)
   - DAG parallelization automatique
   - Pattern capture en background

3. **Adaptive Authentication**
   - Cloud: OAuth flow standard, API Key one-click copy
   - Local: Aucune action requise, tout fonctionne

### 3.4 Critical Success Moments

| Moment | Trigger | Expected Response |
|--------|---------|-------------------|
| First Parallel | Workflow complete 5x plus vite | "C'est magique" |
| Pattern Discovered | Badge "Captured Pattern" apparait | "Il apprend!" |
| Cross-Agent Reuse | Suggestion capability.use() | "Collective intelligence" |
| API Key Ready | Copy button -> MCP config | "Pret a integrer" |

### 3.5 Experience Principles

1. **"Zero to Value"** - Valeur immediate sans configuration
2. **"Show, Don't Tell"** - Preuves visuelles avant explications
3. **"Invisible Intelligence"** - L'optimisation se fait en coulisses
4. **"Collective by Default"** - Les patterns sont partages automatiquement
5. **"Mode Adaptatif"** - L'UI s'adapte Cloud/Local sans friction

---

## 4. Desired Emotional Response

### 4.1 Primary Emotional Goals

**Core Feeling: "Empowered Effortlessness"**

L'utilisateur doit sentir que le systeme amplifie ses capacites sans demander d'effort. Comme un bon assistant, Casys PML anticipe et agit sans qu'on ait a le lui demander.

**Emotional Signature:**
- Installation: Satisfaction rapide ("3 minutes et c'est fait")
- Premier resultat: Surprise positive ("C'est vraiment 5x plus rapide?")
- Usage regulier: Invisibilite ("J'oublie qu'il est la")
- Pattern decouvert: Emerveillement subtil ("Il apprend tout seul")

### 4.2 Emotional Journey Mapping

| Stage | User State | Target Emotion | Design Response |
|-------|------------|----------------|-----------------|
| Discovery | Sceptique | Curiosite | Hero avec preuve concrete |
| Onboarding | Impatient | Accomplissement rapide | 10-min setup |
| First Success | Surpris | Validation | Metriques visibles |
| Daily Use | Occupe | Invisible support | Zero interruption |
| Pattern Found | Intrigue | Fierte partagee | Notification subtile |

### 4.3 Micro-Emotions

**A Cultiver:**
- Confiance -> Preuves visuelles, stats transparentes
- Competence -> Langage pair-a-pair, pas condescendant
- Controle -> Mode local toujours disponible
- Appartenance -> "Collective intelligence" narrative

**A Eviter:**
- Confusion -> Progressive disclosure, pas de jargon impose
- Mefiance -> Open source, transparent par defaut
- Frustration -> Zero-config, "it just works"
- Dependance -> Self-hosted option preservee

### 4.4 Emotional Design Principles

1. **"Prove Before Promise"** - Montrer les resultats avant d'expliquer le fonctionnement
2. **"Whisper, Don't Shout"** - Notifications subtiles, pas d'alertes intrusives
3. **"Competence Assumed"** - Traiter l'utilisateur comme un expert (parce qu'il l'est)
4. **"Control Preserved"** - Toujours offrir une option locale/manuelle
5. **"Magic Revealed"** - Permettre d'explorer "sous le capot" pour les curieux

---

## 5. Visual Design System

### 5.1 Design Tokens (from Landing Page)

**Typography:**
- Display: `var(--font-display)` - Elegant, light weight
- Mono: `var(--font-mono)` - Technical elements, code
- Sizing: Fluid with `clamp()` for responsive

**Colors:**
- Accent: `#FFB86F` (warm orange)
- Green: `#4ADE80` (success states)
- Background: Dark slate tones
- Text: White/muted variants

**Spacing:**
- Sections: `8rem` vertical padding
- Grid gap: `3rem` standard
- Card padding: `1.25rem`

### 5.2 Component Patterns

**Cards:**
- `.hero-example` - Code snippet with header/footer
- `.flow-step` - Process step with icon
- Glass morphism with `var(--bg-card)`

**Buttons:**
- `.btn-primary` - Solid accent background
- `.btn-ghost` - Transparent with border
- Hover states with smooth transitions

**Badges:**
- `.example-badge` - Status indicators (green for success)
- Monospace, uppercase, small

### 5.3 Layout Patterns

**Hero Grid:**
```css
grid-template-columns: 1fr 1.2fr;
gap: 3rem;
```

**Flow Visualization:**
- Horizontal on desktop, vertical on mobile
- Arrow rotation for responsive adaptation
- Highlight on final step (propagation)

---

## 6. Implementation Checklist

### Landing Page (Done 2025-12-07)
- [x] Hero 2-column layout with code snippet
- [x] "Show, Don't Tell" principle applied
- [x] Propagation flow visualization
- [x] Responsive breakpoints

### Dashboard (Epic 9)
- [ ] API Key section with copy functionality
- [ ] Mode indicator (Cloud/Local)
- [ ] Pattern discovery feed
- [ ] Settings page

### Future Considerations
- [ ] Hypergraph visualization (Epic 8)
- [ ] Real-time pattern notifications
- [ ] Team collaboration features

---
