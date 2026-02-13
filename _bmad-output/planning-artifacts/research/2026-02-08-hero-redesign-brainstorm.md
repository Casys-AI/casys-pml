# Hero Redesign Brainstorm — casys.ai

**Date :** 2026-02-08
**Equipe :** Frontend Designer, UX Strategist, Creative Director
**Source :** [Expert Panel Review (7 agents)](./2026-02-08-hub-vitrine-expert-panel-review.md) + [Tech Spec Consulting Reframe](../../implementation-artifacts/tech-specs/2026-02-08-tech-spec-hub-vitrine-consulting-reframe.md)

---

## Contexte

Le panel d'experts (7 agents, 2026-02-08) a diagnostique que le Hero de casys.ai souffre d'un **probleme d'identite** : il se presente comme une landing produit SaaS alors que casys.ai est un hub de consulting en infrastructure MCP.

Le Hero actuel (`lib/casys-hub-vitrine/src/features/landing-v2/Hero.astro`) utilise un layout split `2fr 3fr` avec un carousel 3D de 4 product cards a droite. Le copy a deja ete corrige (Step 1 DONE dans la tech spec) mais le **layout visuel reste oriente produit**.

### Problemes identifies (consensus de l'equipe)

1. **Le carousel 3D est un "attention trap"** (Strategist) — il capte l'attention avant le H1 et defait la hierarchie d'information
2. **Le ratio 2fr/3fr donne 60% de l'espace aux produits** (Designer) — visuellement, les cards dominent le Hero
3. **Le Hub doit se differencier visuellement de ses sous-sites** (Creative Director) — engine, mcp-server et mcp-std utilisent tous un split grid + terminal ; le Hub doit avoir sa propre identite de "parent consulting"
4. **4 produits au meme poids = anti-pattern startup** (Panel) — l'impression que le fondateur ne sait pas choisir, au lieu de "expert qui montre ses preuves"
5. **Le H1 split CSS donne "From" tout seul en premiere ligne** (Designer) — zero impact typographique

### Analyse du funnel CTO (Strategist)

Le CTA primary "Work With Us" pointe vers `#work-with-us`, mais il y a 4-5 sections entre le Hero et WorkWithUs. Un CTO qui clique et doit scroller pendant 10 secondes risque de decrocher. La solution : si on reduit la hauteur du Hero (suppression carousel), le WorkWithUs remonte naturellement dans le parcours de scroll.

Le CTA secondary "View on GitHub" sort du site — le visiteur est perdu. Mieux : "Explore Projects" → `#projects` qui maintient le visiteur sur la page et le guide vers les preuves OSS.

### Ce qui fonctionne (a preserver)

1. Paire typographique Fraunces (display) + Instrument Serif (italic accent) — distinctive et premium
2. Palette warm dark (#FFB86F accent sur #0a0908) — identite visuelle forte
3. Gradient orb background — subtil et elegante
4. Dual CTAs — le pattern primary + secondary fonctionne bien
5. Accessibilite clavier + `prefers-reduced-motion` — conformite WCAG
6. Le H1 "From Knowledge Graphs to MCP Servers" — narratif unique dans l'ecosysteme MCP

---

## Propositions

### 1. "Quick Rebalance" — Ajustements CSS conservateurs

**Concept :** Garder le layout split et le carousel existants mais reequilibrer la hierarchie visuelle via des ajustements CSS minimaux. Pas de changement structurel HTML.

**Layout :**
```
┌──────────────────────────┬────────────────┐
│ From Knowledge Graphs     │                │
│ to MCP Servers      ← 60% │  [carousel] ← 40%
│                           │  (3D stack)    │
│ 10 years of knowledge...  │  mais plus     │
│                           │  compact,      │
│ [Stats row]               │  pas d'auto-   │
│ [Work With Us] [GitHub]   │  rotation      │
└──────────────────────────┴────────────────┘
```

**Changements CSS concrets :**

```css
/* 1. Inverser le ratio grid */
.container {
  grid-template-columns: 3fr 2fr; /* etait 2fr 3fr */
}

/* 2. Augmenter le H1 pour dominer visuellement */
.hero-title {
  font-size: clamp(3.5rem, 7vw, 5.5rem); /* etait clamp(3rem, 6vw, 4.5rem) */
}

/* 3. Reduire la hauteur du carousel */
.card-stack {
  height: 320px; /* etait 400px */
  max-width: 440px; /* etait 520px */
}

/* 4. Augmenter la taille du CTA primary */
.cta-primary {
  padding: 18px 40px; /* etait 16px 32px */
  font-size: 1.0625rem; /* etait 1rem */
}
```

**Changement JS :**
```javascript
// 5. Desactiver l'auto-rotation par defaut
// Dans le script is:inline, commenter ou supprimer :
// startAutoPlay();
// Le visiteur clique sur les dots pour naviguer manuellement
```

**Avantages consulting :**
- Effort minimal (~2h), risque zero
- Le texte reprend la dominance visuelle (60% vs 40%)
- Le carousel reste comme preuve OSS mais ne domine plus
- Pas d'auto-rotation = le visiteur controle son attention
- Compatible avec le scope actuel de la tech spec

**Risques :**
- Ne resout pas fondamentalement le probleme : les product cards sont TOUJOURS dans le Hero
- Le carousel reste visuellement complexe et potentiellement distrayant
- Un CTO voit toujours un "showcase produit" meme si c'est plus equilibre

**Effort :** Petit (2-3 heures, modifications CSS/JS uniquement)

---

### 2. "Editorial Authority" — Layout centre avec proof bar (Recommandee)

**Concept :** Supprimer completement le carousel 3D. Passer en layout full-width centre ou le H1 et le message d'expertise dominent toute la largeur. Un **kicker SEO** ("MCP Infrastructure Expertise") au-dessus du H1 resout le probleme SEO sans polluer le titre narratif. Les 4 produits OSS deviennent un **proof bar** compact en bas du Hero — une barre horizontale avec separateurs, cliquable mais visuellement secondaire.

**Element cle du designer :** Le kicker `<p class="hero-kicker">MCP Infrastructure Expertise</p>` place au-dessus du H1 permet d'avoir "MCP" + "Expertise" visible sans modifier le H1 poetique "From Knowledge Graphs to MCP Servers".

**Layout :**
```
┌─────────────────────────────────────────────┐
│                                             │
│       MCP INFRASTRUCTURE EXPERTISE          │  ← kicker (small caps, accent)
│                                             │
│          From Knowledge Graphs              │
│          to MCP Servers        ← H1 grand   │
│                                Fraunces     │
│   10 years of knowledge engineering —       │
│   shipped as open-source infrastructure     │
│   for your team.               ← subtitle   │
│                                             │
│     [Work With Us]  [Explore Projects]      │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │ mcp-std    │ mcp-server │ PML │ Engine │ │  ← proof bar
│   │ 508 tools  │ Prod auth  │ GW  │ Score  │ │
│   └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

**Structure HTML (Designer) :**
```html
<section id="hero">
  <div class="hero-container">
    <div class="gradient-orb" aria-hidden="true"></div>

    <!-- Main statement -->
    <div class="hero-statement">
      <p class="hero-kicker">MCP Infrastructure Expertise</p>
      <h1 class="hero-title">
        <span class="title-line-1">From Knowledge Graphs</span>
        <span class="title-line-2">to MCP Servers</span>
      </h1>
      <p class="hero-subtitle">
        10 years of knowledge engineering — shipped as open-source
        infrastructure for your team.
      </p>

      <div class="cta-group">
        <a href="#work-with-us" class="cta-primary">
          <span class="material-symbols-rounded">handshake</span>
          Work With Us
        </a>
        <a href="#projects" class="cta-secondary">
          <span class="material-symbols-rounded">explore</span>
          Explore Projects
        </a>
      </div>
    </div>

    <!-- Proof bar: compact product badges -->
    <div class="proof-bar">
      <a href="https://mcp-std.casys.ai" class="proof-badge">
        <span class="badge-name">mcp-std</span>
        <span class="badge-stat">508 tools</span>
      </a>
      <span class="proof-separator" aria-hidden="true"></span>
      <a href="https://mcp-server.casys.ai" class="proof-badge">
        <span class="badge-name">mcp-server</span>
        <span class="badge-stat">Production auth</span>
      </a>
      <span class="proof-separator" aria-hidden="true"></span>
      <a href="https://pml.casys.ai" class="proof-badge">
        <span class="badge-name">Casys PML</span>
        <span class="badge-stat">Gateway</span>
      </a>
      <span class="proof-separator" aria-hidden="true"></span>
      <a href="https://engine.casys.ai" class="proof-badge">
        <span class="badge-name">Engine</span>
        <span class="badge-stat">Graph scoring</span>
      </a>
    </div>
  </div>
</section>
```

**CSS complet (Designer) :**
```css
/* ===== EDITORIAL AUTHORITY ===== */

#hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--casys-warm-background, #0a0908);
  overflow: hidden;
}

.hero-container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 120px 48px 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 64px;
  position: relative;
  z-index: 2;
}

.hero-statement {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

/* Kicker: SEO-friendly, small caps, accent */
.hero-kicker {
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--casys-warm-accent, #FFB86F);
  margin: 0 0 16px;
}

/* Title: massive, centered, mixed fonts */
.hero-title {
  font-family: 'Fraunces', Georgia, serif;
  font-size: clamp(3rem, 7vw, 5.5rem);
  font-weight: 500;
  font-optical-sizing: auto;
  line-height: 1.05;
  letter-spacing: -0.03em;
  text-align: center;
  margin: 0;
  color: var(--casys-warm-text-primary, #f5f0ea);
}

.title-line-1 { display: block; }

.title-line-2 {
  display: block;
  font-family: 'Instrument Serif', Georgia, serif;
  font-style: italic;
  color: var(--casys-warm-accent, #FFB86F);
}

.hero-subtitle {
  font-size: clamp(1.125rem, 2vw, 1.375rem);
  line-height: 1.6;
  color: var(--casys-warm-text-secondary, #d5c3b5);
  text-align: center;
  max-width: 600px;
  margin: 0;
}

/* CTAs */
.cta-group {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 8px;
}

.cta-primary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 32px;
  background: var(--casys-warm-accent, #FFB86F);
  color: var(--casys-warm-surface, #1a1815);
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  transition: background 200ms ease-out;
}

.cta-primary:hover {
  background: var(--casys-warm-accent-hover, #D4A574);
}

.cta-primary:focus-visible {
  outline: 3px solid var(--casys-warm-accent, #FFB86F);
  outline-offset: 4px;
}

.cta-secondary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 24px;
  background: transparent;
  color: var(--casys-warm-text-primary, #f5f0ea);
  border: 1px solid rgba(255, 184, 111, 0.2);
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  text-decoration: none;
  transition: background 200ms ease-out, border-color 200ms ease-out;
}

.cta-secondary:hover {
  background: rgba(255, 184, 111, 0.1);
  border-color: var(--casys-warm-accent, #FFB86F);
}

.cta-secondary:focus-visible {
  outline: 3px solid var(--casys-warm-accent, #FFB86F);
  outline-offset: 4px;
}

/* Proof bar */
.proof-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 20px 32px;
  background: var(--casys-warm-surface, #1a1815);
  border-radius: 12px;
  border: 1px solid rgba(255, 184, 111, 0.1);
}

.proof-badge {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-decoration: none;
  transition: opacity 200ms ease-out;
}

.proof-badge:hover { opacity: 0.8; }

.proof-badge:focus-visible {
  outline: 2px solid var(--casys-warm-accent, #FFB86F);
  outline-offset: 3px;
  border-radius: 4px;
}

.badge-name {
  font-family: 'JetBrains Mono', 'Geist Mono', monospace;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--casys-warm-text-primary, #f5f0ea);
}

.badge-stat {
  font-size: 0.6875rem;
  color: var(--casys-warm-text-muted, #a89a8c);
}

.proof-separator {
  width: 1px;
  height: 32px;
  background: rgba(255, 184, 111, 0.15);
}

/* Gradient orb background */
.gradient-orb {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(1200px, 80vw);
  height: min(1200px, 80vh);
  background:
    radial-gradient(circle at 30% 40%, rgba(255, 184, 111, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 70% 60%, rgba(212, 165, 116, 0.06) 0%, transparent 50%);
  filter: blur(100px);
  opacity: 0.4;
  z-index: 0;
  pointer-events: none;
}

/* Mobile */
@media (max-width: 768px) {
  .hero-container {
    padding: 100px 16px 40px;
    gap: 48px;
  }

  .proof-bar {
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    width: 100%;
  }

  .proof-separator {
    width: 80%;
    height: 1px;
  }

  .cta-group {
    flex-direction: column;
    width: 100%;
  }

  .cta-primary, .cta-secondary {
    width: 100%;
    justify-content: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cta-primary, .cta-secondary, .proof-badge {
    transition-duration: 0ms;
  }
}
```

**Avantages consulting :**
- Le H1 est LE premier element vu — zero competition visuelle
- Le kicker "MCP Infrastructure Expertise" resout le SEO sans polluer le titre narratif
- Le proof bar montre l'ecosysteme sans le mettre en concurrence avec le H1
- Differentiation claire vs sous-sites (qui utilisent split + terminal)
- Reduction massive du code : ~1200 lignes → ~250 lignes (-80%)
- 0 JavaScript necessaire (le carousel et ses 150 lignes de JS disparaissent)
- Excellent support trilingue (pas de layout complexe qui casse avec des longueurs de texte differentes)
- Mobile trivial (proof bar passe en colonne, pas de scroll horizontal)
- Accessibilite simplifiee (pas de carousel ARIA complexe, focus-visible sur tous les interactifs)

**Risques :**
- Peut sembler "vide" sans le carousel — le gradient-orb et la typographie soignee doivent porter le visual
- Hors du scope actuel de la tech spec (necessite ajout d'un Step 1b)
- Les sites consulting premium (McKinsey, Bain) peuvent se permettre un Hero texte-only car ils ont du brand recognition ; un indie consultant n'a pas ce luxe — le proof bar mitigue ce risque

**Effort :** Moyen (3-5 jours, restructuration HTML + CSS + suppression carousel JS)

---

### 3. "The Journey" — Timeline d'expertise a droite

**Concept :** Garder un split layout mais remplacer le carousel par une timeline verticale minimaliste montrant la trajectoire du fondateur (2013 KM Systems → 2018 Graph DB → 2023 MCP → 2026 Production). Chaque etape avec une icone Material et une ligne descriptive. Pure CSS, zero JS.

**Layout :**
```
┌──────────────────────┬───────────────────────┐
│ From Knowledge Graphs│  ○ 2013               │
│ to MCP Servers       │  │ Knowledge Mgmt     │
│                      │  │ Systems            │
│ 10 years of...       │  ○ 2018               │
│                      │  │ Graph Databases     │
│ [Stats row]          │  ○ 2023               │
│                      │  │ MCP Protocol        │
│ [Work With Us]       │  ● 2026               │
│ [View on GitHub]     │    Production Infra    │
└──────────────────────┴───────────────────────┘
```

**Snippet CSS cle :**
```css
.container {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 64px;
  align-items: center;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
  padding-left: 32px;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 11px;
  top: 12px;
  bottom: 12px;
  width: 2px;
  background: var(--md-sys-color-outline-variant);
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 0;
  position: relative;
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--md-sys-color-outline-variant);
  position: absolute;
  left: -27px;
  top: 20px;
  flex-shrink: 0;
}

.timeline-item:last-child .timeline-dot {
  background: var(--md-sys-color-primary);
  width: 14px;
  height: 14px;
  left: -28px;
  box-shadow: 0 0 0 4px rgba(255, 184, 111, 0.2);
}

.timeline-year {
  font-family: 'Geist Mono', monospace;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--md-sys-color-primary);
  min-width: 48px;
}

.timeline-label {
  font-size: 0.9375rem;
  color: var(--md-sys-color-on-surface-variant);
  line-height: 1.4;
}
```

**Avantages consulting :**
- Raconte l'histoire d'expertise — differenciateur unique (aucun concurrent MCP n'a 10 ans de parcours)
- Coherent avec le H1 "trajectory" (From → to)
- CSS-only, 0 JavaScript
- Le texte domine (3fr vs 2fr) — le message consulting passe en premier
- La timeline a droite est visuellement plus legere qu'un carousel

**Risques :**
- Peut sembler "resume/CV" au lieu d'"autorite" (Strategist)
- Necessite un design tres soigne pour ne pas faire amateur
- Les dates specifiques (2013, 2018, 2023) sont des engagements factuels — il faut qu'elles soient correctes
- La timeline est vide d'information actionnable pour le CTO — il sait QUAND mais pas QUOI ca lui apporte

**Effort :** Moyen (3-5 jours, nouveau composant timeline + CSS responsive)

---

### 4. "Proof Grid" — Layout centre avec grille 2x2 de produits (Alternative)

**Concept :** Variante du Concept #2 proposee par le Designer. Titre centre + subtitle, puis une **grille 2x2** compacte de "proof cards" au lieu d'un proof bar. Chaque card est une mini-fiche avec icone + nom + description + badge (MIT/Beta/Research). Plus de visibilite produit que le proof bar, mais les cards restent sous le titre.

**Layout :**
```
┌─────────────────────────────────────────────┐
│       MCP INFRASTRUCTURE EXPERTISE          │
│                                             │
│          From Knowledge Graphs              │
│          to MCP Servers                     │
│                                             │
│   10 years of knowledge engineering...      │
│                                             │
│     [Work With Us]  [Explore Projects]      │
│                                             │
│   ┌──────────────────┬──────────────────┐   │
│   │ [icon] mcp-std   │ [icon] mcp-server│   │
│   │ 508 tools    MIT │ Prod auth    MIT │   │
│   ├──────────────────┼──────────────────┤   │
│   │ [icon] Casys PML │ [icon] Engine    │   │
│   │ Gateway     Beta │ Scoring Research │   │
│   └──────────────────┴──────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

**Structure HTML (Designer) :**
```html
<div class="proof-grid">
  <a href="https://mcp-std.casys.ai" class="proof-card">
    <span class="proof-icon material-symbols-rounded">construction</span>
    <div class="proof-info">
      <span class="proof-name">mcp-std</span>
      <span class="proof-desc">508 tools, 32 categories</span>
    </div>
    <span class="proof-badge">MIT</span>
  </a>
  <a href="https://mcp-server.casys.ai" class="proof-card">
    <span class="proof-icon material-symbols-rounded">dns</span>
    <div class="proof-info">
      <span class="proof-name">mcp-server</span>
      <span class="proof-desc">Production auth &amp; middleware</span>
    </div>
    <span class="proof-badge">MIT</span>
  </a>
  <a href="https://pml.casys.ai" class="proof-card">
    <span class="proof-icon material-symbols-rounded">hub</span>
    <div class="proof-info">
      <span class="proof-name">Casys PML</span>
      <span class="proof-desc">Gateway, any model</span>
    </div>
    <span class="proof-badge">Beta</span>
  </a>
  <a href="https://engine.casys.ai" class="proof-card">
    <span class="proof-icon material-symbols-rounded">psychology</span>
    <div class="proof-info">
      <span class="proof-name">Engine</span>
      <span class="proof-desc">Graph scoring, no LLM</span>
    </div>
    <span class="proof-badge">Research</span>
  </a>
</div>
```

**CSS cle (Designer) :**
```css
.proof-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  width: 100%;
  max-width: 800px;
}

.proof-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  background: var(--casys-warm-surface, #1a1815);
  border: 1px solid rgba(255, 184, 111, 0.1);
  border-radius: 12px;
  text-decoration: none;
  transition: border-color 200ms ease-out, background 200ms ease-out;
}

.proof-card:hover {
  border-color: var(--casys-warm-accent, #FFB86F);
  background: rgba(255, 184, 111, 0.05);
}

.proof-icon {
  font-size: 24px;
  color: var(--casys-warm-accent, #FFB86F);
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 184, 111, 0.1);
  border-radius: 10px;
  flex-shrink: 0;
}

.proof-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-grow: 1;
  min-width: 0;
}

.proof-name {
  font-family: 'JetBrains Mono', 'Geist Mono', monospace;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--casys-warm-text-primary, #f5f0ea);
}

.proof-desc {
  font-size: 0.75rem;
  color: var(--casys-warm-text-muted, #a89a8c);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.proof-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(255, 184, 111, 0.15);
  color: var(--casys-warm-accent, #FFB86F);
  white-space: nowrap;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .proof-grid { grid-template-columns: 1fr; }
}
```

**Avantages consulting :**
- Bon equilibre entre message consulting et visibilite produit
- Les 4 produits sont visibles d'un coup (pas de carousel, pas de rotation)
- Les cards sont cliquables = entree directe vers les sous-sites pour les devs
- Les badges MIT/Beta/Research ajoutent de la credibilite
- Grille 2x2 → 1 colonne sur mobile = responsive naturel

**Risques :**
- Moins dramatique que la proposition #2 (Editorial Authority) — le titre a moins d'espace pour respirer
- Les proof cards dans le Hero maintiennent une certaine ambiguite "landing produit"
- Les cards prennent de l'espace vertical = le titre remonte, moins d'impact "editorial"

**Effort :** Moyen (3-5 jours, meme restructuration que #2 mais avec proof grid au lieu de proof bar)

---

## Tableau comparatif (Designer)

| Critere | #1 Quick Rebalance | #2 Editorial Authority | #3 The Journey | #4 Proof Grid |
|---------|-------------------|----------------------|----------------|---------------|
| Impact visuel | Faible | **Maximal** | Fort | Moyen |
| Message clarity | Moyen | **Excellent** | Excellent | Bon |
| Product visibility | Forte (carousel) | Faible (proof bar) | Aucune | **Forte** (cards) |
| Trilingue safe | Bon | **Excellent** | Bon | Bon |
| Mobile | Bon | **Excellent** | Moyen (timeline hidden) | Bon |
| Complexite impl. | **Tres faible** | Faible | Moyenne | Faible |
| Funnel CTO | Moyen | **Excellent** | Excellent | Bon |
| Funnel Dev | Bon | Moyen | Faible | **Excellent** |

---

## Classement final

| # | Proposition | Score | Justification |
|---|------------|-------|---------------|
| 1 | **"Editorial Authority"** (Recommandee) | 9/10 | Resout le probleme fondamental (produit → consulting), reduction massive du code (-80%), kicker SEO, differentiation vs sous-sites, zero JS, mobile trivial. Le proof bar est suffisant pour les devs curieux. |
| 2 | **"Proof Grid"** (Alternative) | 7.5/10 | Meilleur compromis si le fondateur veut plus de visibilite produit. La grille 2x2 est informative sans etre un carousel. Bon pour le funnel dev. Mais les cards dans le Hero maintiennent l'ambiguite "landing produit". |
| 3 | **"The Journey"** | 7/10 | Concept interessant et differenciateur unique mais risque "CV/resume". La timeline disparait sur mobile. Pourrait etre un excellent element dans une section WhyCasys plutot que dans le Hero. |
| 4 | **"Quick Rebalance"** | 6/10 | Quick win dans le scope actuel, mais ne resout pas le probleme de fond. Les cards restent dans le Hero. Bon comme etape intermediaire avant le full redesign. |

---

## Recommandation de mise en oeuvre

### Phase immediate (dans le scope tech spec actuel)
Implementer **"Quick Rebalance"** comme Step 1c dans la tech spec :
- Inverser le ratio CSS `2fr 3fr` → `3fr 2fr`
- Augmenter le H1 font-size
- Desactiver l'auto-rotation du carousel
- Effort : 2-3 heures

### Phase suivante (Step 1b — "Hero Layout Simplification")

**Framing cle (Designer) :** Ce n'est PAS une "refonte complete du layout" (Out of Scope dans la tech spec). C'est une **simplification ciblée** qui repond directement a la convergence C1 du panel. Le bilan net est une **reduction de code**, pas un ajout.

Implementer **"Editorial Authority"** :
- Supprimer le carousel et son JS
- Restructurer le HTML en layout centre avec kicker SEO
- Ajouter le proof bar en bas du Hero
- Effort : 3-5 jours

**Bilan de code dans `Hero.astro` :**

| Action | Lignes |
|--------|--------|
| Supprimer `<div class="card-stack-wrapper">` (HTML) | -40 |
| Supprimer `<script is:inline>` (JS carousel) | -150 |
| Supprimer CSS stack/card/dot/animations | -400 |
| Ajouter proof bar (HTML) | +20 |
| Ajouter proof bar + layout centre (CSS) | +60 |
| Ajouter kicker (HTML) | +2 |
| **Net** | **-508 lignes** |

**Gains techniques :**
- 0 JavaScript au lieu de 150 lignes de carousel logic
- Meilleur Largest Contentful Paint (pas d'animation complexe au load)
- Meilleur accessibilite (pas de carousel ARIA role="tablist" + auto-rotation)
- Zero maintenance (pas de timer, pas de dots, pas de positions 3D)

**Alternative :** Si le fondateur souhaite plus de visibilite produit, implementer **"Proof Grid"** (proposition #4) a la place — meme structure centre mais avec une grille 2x2 de cards au lieu du proof bar compact. Le code HTML/CSS est fourni dans la proposition #4.

### Elements a preserver dans toutes les options
- H1 : "From Knowledge Graphs to MCP Servers" (trilingue)
- Subtitle : "10 years of knowledge engineering — shipped as open-source infrastructure for your team." (trilingue)
- Stats : `10+ Years | 508+ MCP Tools | 4 OSS Projects` (experience en premier)
- CTA primary : "Work With Us" → #work-with-us
- CTA secondary : "Explore Projects" → #projects (maintient le visiteur sur la page)
- Palette warm dark tokens (`--casys-warm-*`)
- Fonts : Fraunces (H1), Instrument Serif (accent italic), Inter (body), Geist Mono (code/badges)
- Gradient orb background
- `prefers-reduced-motion` et accessibilite clavier

---

## Consensus de l'equipe

### Points d'accord unanimes
1. Le carousel 3D doit disparaitre du Hero (a terme)
2. Le H1 actuel "From Knowledge Graphs to MCP Servers" est le bon choix
3. Le CTA primary "Work With Us" est correct
4. La palette warm dark et la typographie sont des atouts a preserver
5. Le Hub doit se differencier visuellement des sous-sites (qui utilisent split + terminal)

### Points de debat resolus
- **Proof badges in/out du Hero** → IN (decision Creative Director : above-the-fold visibility)
- **CTA secondaire** → Change de "View on GitHub" a **"Explore Projects" → #projects** (Strategist : garder le visiteur sur la page plutot que de le perdre sur GitHub)
- **Stats** → Re-ordonnes avec experience en premier : `10+ Years | 508+ MCP Tools | 4 OSS Projects`
- **Subtitle** → Garder l'actuel (le "We" sonne trop corporate pour un solo-fondateur)
- **Micro-funnel WorkWithUs dans le Hero** → REJETE (Creative Director : surcharge visuelle, le Hero centre fonctionne parce qu'il est epure ; la reduction de hauteur du Hero remontera naturellement WorkWithUs dans le scroll)

### Point de tension resolu
- **La tech spec met le redesign layout en "Out of Scope"** — MAIS l'Editorial Authority n'est pas une "refonte complete". C'est une **simplification** (-508 lignes nettes). Le panel recommande explicitement cette action (#6, effort 1 semaine). Le framing correct est "Step 1b : Hero Layout Simplification", pas "refonte du layout".

---

*Document produit le 2026-02-08 par l'equipe brainstorm Hero redesign.*
*Creative Director : synthese et decisions. Designer : analyse technique et propositions visuelles. UX Strategist : diagnostic UX et recommandations conversion.*
