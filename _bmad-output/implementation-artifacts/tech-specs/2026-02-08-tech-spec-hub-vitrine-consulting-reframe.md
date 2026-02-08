---
title: 'Hub Vitrine - Consulting Reframe (Panel Review Implementation)'
slug: 'hub-vitrine-consulting-reframe'
created: '2026-02-08'
status: 'in-progress'
stepsCompleted:
  - 'step-1-hero-redesign'
  - 'step-1b-hero-editorial-authority'
  - 'step-2-socialproof-github-metrics'
  - 'step-3-workwithus-clarify-model'
  - 'step-3b-remove-free-paid-badges'
  - 'step-4a-astro-config-site'
  - 'step-4b-robots-txt'
  - 'step-4c-footer-tagline'
  - 'step-5-subsite-headers-work-with-us'
  - 'step-7a-warm-tokens-design-system'
  - 'step-7b-styles-css-tokens'
  - 'step-7c-landing-v2-dark-mode-tokens'
  - 'step-7d-catalog-islands-tokens'
stepsInProgress: []
stepsCompletedSinceLastUpdate:
  - 'step-8-cross-site-factorization'
  - 'step-8b-i18n-centralization'
source: '_bmad-output/planning-artifacts/research/2026-02-08-hub-vitrine-expert-panel-review.md'
tech_stack:
  - 'Astro 5.x (lib/casys-hub-vitrine)'
  - 'Material Design 3 tokens (packages/design-system/)'
  - 'Preact islands (catalog)'
  - 'Vercel adapter (SSR + rewrites)'
  - 'Google Fonts (Fraunces, Instrument Serif, Inter)'
files_to_modify:
  - 'lib/casys-hub-vitrine/src/features/landing-v2/Hero.astro (DONE - H1, stats, CTAs, Engine card)'
  - 'lib/casys-hub-vitrine/src/features/landing-v2/SocialProof.astro (remove placeholder, add GitHub metrics)'
  - 'lib/casys-hub-vitrine/src/features/landing-v2/WorkWithUs.astro (clarify free vs paid)'
  - 'lib/casys-hub-vitrine/src/components/Footer.astro (update tagline from "Applied AI Research")'
  - 'lib/casys-hub-vitrine/astro.config.mjs (add site property)'
  - 'lib/casys-hub-vitrine/public/robots.txt (new)'
  - 'lib/casys-hub-vitrine/src/features/engine/EngineHeader.astro (add Work With Us link)'
  - 'lib/casys-hub-vitrine/src/features/mcp-server/McpServerHeader.astro (add Work With Us link)'
  - 'lib/casys-hub-vitrine/src/features/mcp-std/McpStdHeader.astro (add Work With Us link)'
  - 'lib/casys-hub-vitrine/packages/design-system/tokens/m3-colors-generated.css (add --casys-warm-* tokens in dark mode)'
  - 'lib/casys-hub-vitrine/src/styles.css (replace #FFB86F with var(--casys-warm-accent))'
  - 'lib/casys-hub-vitrine/src/features/landing-v2/*.astro (replace dark mode hex with var(--casys-warm-*))'
  - 'lib/casys-hub-vitrine/src/islands/catalog/CatalogPageIsland.tsx (replace hex with var(--casys-warm-*))'
  - 'lib/casys-hub-vitrine/src/islands/catalog/shared/ToolDetailPanel.tsx (replace hex with var(--casys-warm-*))'
  - 'lib/casys-hub-vitrine/src/islands/catalog/shared/CapabilityDetailPanel.tsx (replace hex with tokens)'
  - 'lib/casys-hub-vitrine/src/islands/catalog/shared/SchemaViewer.tsx (replace hex with tokens)'
files_to_create:
  - 'lib/casys-hub-vitrine/public/robots.txt'
  - 'lib/casys-hub-vitrine/src/components/SubsiteLayout.astro (Phase 3)'
  - 'lib/casys-hub-vitrine/src/components/SubsiteHeader.astro (Phase 3)'
  - 'lib/casys-hub-vitrine/src/components/FeatureHeroSection.astro (Phase 3)'
  - 'lib/casys-hub-vitrine/src/components/InstallSection.astro (Phase 3)'
code_patterns:
  - 'Trilingual inline translations: const translations = { en: {}, fr: {}, zh: {} }'
  - 'Material 3 CSS custom properties: var(--md-sys-color-*)'
  - 'Scoped + global styles in Astro components'
  - 'Intersection Observer for scroll animations'
  - 'Preact islands for interactive components (catalog)'
test_patterns:
  - 'Manual: browse localhost:4321 (EN), /fr/ (FR), /zh/ (ZH)'
  - 'Manual: verify Hero H1 split renders correctly (first word normal, rest italic accent)'
  - 'Manual: verify CTA links and targets (primary internal, secondary external)'
  - 'Manual: verify SocialProof section renders GitHub metrics'
  - 'Manual: verify WorkWithUs pricing clarity'
  - 'Manual: verify subsite headers have "Work With Us" link'
  - 'Build: cd lib/casys-hub-vitrine && pnpm build passes without errors'
  - 'Lighthouse: run audit on localhost:4321 - check SEO score'
---

# Tech-Spec: Hub Vitrine - Consulting Reframe

**Created:** 2026-02-08
**Source:** [Expert Panel Review (7 agents, 2026-02-08)](./../../../planning-artifacts/research/2026-02-08-hub-vitrine-expert-panel-review.md)

## Overview

### Problem Statement

Un panel de 7 agents spécialisés (SEO, copywriter, designer, stratège, entrepreneur, développeur, KM expert) a audité `casys.ai` et ses sous-sites le 2026-02-08. Le verdict : **7/10 — "Clarify. Connect. Convert."**

Le diagnostic principal : **le hub casys.ai est une vitrine de consulting d'expertise MCP qui se présente accidentellement comme une landing produit**, créant une confusion d'identité qui dilue la conversion vers les services.

Les 5 convergences unanimes du panel :
1. **Le Hero est orienté produit** alors que le business est orienté services
2. **Le testimonial placeholder signale l'absence de clients** (pire que rien)
3. **Le mot "MCP" est absent du H1** (invisible sur les requêtes SEO)
4. **Le business model (gratuit vs payant) n'est pas explicite**
5. **La navigation entre hub et sous-sites manque de fluidité**

En plus, l'audit technique a révélé :
- **37 fichiers** avec i18n inline (pas de système centralisé)
- **87+ couleurs hardcodées** (dont 40+ dans `CatalogPageIsland.tsx`)
- **~2500 lignes dupliquées** entre les sous-sites (layouts, headers, heroes, install sections)

### Solution

Implémenter les recommandations du panel en 4 phases progressives, de la plus urgente (quick wins) à la plus structurelle (factorisation cross-site).

### Scope

**In Scope:**
- Phase 1 : Quick wins copy & SEO (Hero, SocialProof, WorkWithUs, robots.txt)
- Phase 2 : Navigation cross-site (pont dev→CTO, product switcher dans headers)
- Phase 3 : Factorisation technique (composants partagés, tokens couleur)
- Phase 4 : Contenu SEO (page pilier MCP, portfolio)

**Out of Scope:**
- Migration i18n vers système centralisé (trop large pour cette spec — spec dédiée recommandée)
- Refonte complète du design/layout (le panel note 7/10 le visuel — on ne touche pas)
- Publication npm dual-publish JSR+npm (spec dédiée)
- Migration des composants Preact → Astro natif

---

## Phase 1 — Quick Wins Copy & SEO

**Effort total estimé :** 1 journée
**Impact :** Critique

### Step 1 : Hero Redesign — Editorial Authority [DONE ✅]

> **Implementation note (2026-02-08):** Rewrite complet du Hero en layout "Editorial Authority" (score 9/10 du brainstorm). Layout centré pleine largeur, kicker SEO, H1 en Fraunces serif, proof bar avec 4 produits (mcp-std, mcp-server, Casys PML, Engine), 0 JavaScript, gradient orb subtil. Le carousel 3D et les product cards ont été retirés au profit d'un design text-first qui communique l'expertise consulting.

**Fichier :** `lib/casys-hub-vitrine/src/features/landing-v2/Hero.astro` (lignes 1-197, translations)

Changements déjà appliqués :

| Élément | Avant | Après |
|---------|-------|-------|
| H1 (EN) | "Applied AI Research" | "From Knowledge Graphs to MCP Servers" |
| H1 (FR) | "Applied AI Research" | "Des Knowledge Graphs aux serveurs MCP" |
| H1 (ZH) | "Applied AI Research" | "从知识图谱到 MCP 服务器" |
| Subtitle | "Open-source infrastructure for MCP..." | "10 years of knowledge engineering — shipped as open-source infrastructure for your team." |
| Stat 2 | "MIT Licensed" | "10+ Years Experience" |
| Stat 3 | "4 OSS Packages" | "4 OSS Projects" |
| CTA primary | "View on GitHub" → github.com | "Work With Us" → #work-with-us |
| CTA secondary | "Consulting & Training" → #work-with-us | "View on GitHub" → github.com |
| Engine card | "Sparse Heterogeneous Graph Attention" | "Graph-based tool ranking" |

Le layout, CSS, JS carousel et les 4 product cards restent identiques.

### Step 2 : Supprimer le testimonial placeholder

**Fichier :** `lib/casys-hub-vitrine/src/features/landing-v2/SocialProof.astro`

**Problème :** La section contient un texte placeholder "More testimonials coming as Casys PML reaches production users" qui signale activement l'absence de clients — pire que rien pour un consulting.

**Action :**
1. Retirer le texte placeholder et le bloc de testimonials vides
2. Garder les 3 stat cards existantes ("Building in Public") :
   - Active development (commits/week)
   - 10+ years experience
   - French Tech Taiwan
3. Remplacer le bloc testimonials par des **métriques GitHub réelles** :
   - Stars sur les repos principaux (casys-mcp-server, casys-mcp-std, casys-pml-engine)
   - Nombre de contributors
   - Dernier release date
   - Badge CI status

```astro
<!-- Pattern recommandé -->
<div class="github-proof">
  <h3>{t.githubTitle}</h3> <!-- "Open Source Track Record" -->
  <div class="repo-cards">
    {repos.map(repo => (
      <a href={repo.url} class="repo-card">
        <span class="repo-name">{repo.name}</span>
        <span class="repo-stars">★ {repo.stars}</span>
        <span class="repo-desc">{repo.description}</span>
      </a>
    ))}
  </div>
</div>
```

**Note :** Les données GitHub peuvent être en dur pour l'instant (pas besoin d'API fetch dynamique). Actualiser manuellement lors des releases.

4. Retirer le CTA "Join Waitlist" (non pertinent pour du consulting)
5. Remplacer par un lien discret vers GitHub org : "See all projects on GitHub →"

### Step 3 : Clarifier gratuit vs payant dans WorkWithUs

**Fichier :** `lib/casys-hub-vitrine/src/features/landing-v2/WorkWithUs.astro`

**Problème :** La distinction entre ce qui est gratuit (OSS) et ce qui est payant (consulting) est implicite. Un CTO qui évalue Casys ne sait pas ce qu'il paierait.

**Actions :**
1. Ajouter une phrase explicite au-dessus des 3 cards :

```
EN: "Our tools are free and open-source. When you need help implementing them, we're here."
FR: "Nos outils sont gratuits et open-source. Quand vous avez besoin d'aide pour les déployer, on est là."
ZH: "我们的工具免费开源。当您需要部署帮助时，我们随时为您服务。"
```

2. Ajouter des signaux de pricing dans la card "Collaborate" :

```
EN: "Typical engagement: 2-5 days. Remote-first, timezone-flexible."
FR: "Engagement typique : 2-5 jours. Full remote, flexible sur les fuseaux horaires."
ZH: "典型项目周期：2-5天。远程优先，时区灵活。"
```

3. Ajouter un badge "Free" sur la card "Explore" et "Paid" sur "Learn" et "Collaborate"

### Step 4 : Corrections SEO de base

**Fichiers multiples :**

#### 4a. Ajouter `site` dans astro.config.mjs

```javascript
// lib/casys-hub-vitrine/astro.config.mjs
export default defineConfig({
  site: 'https://casys.ai',
  // ... reste inchangé
});
```

Cela active automatiquement la génération du sitemap par Astro et les URLs canoniques absolues.

#### 4b. Créer robots.txt

**Fichier :** `lib/casys-hub-vitrine/public/robots.txt`

```
User-agent: *
Allow: /

Sitemap: https://casys.ai/sitemap-index.xml
```

#### 4c. Mettre à jour le tagline du Footer

**Fichier :** `lib/casys-hub-vitrine/src/components/Footer.astro`

Le footer affiche encore "Applied AI Research" comme tagline sous le logo. Remplacer par :

```
EN: "MCP Infrastructure Expertise"
FR: "Expertise Infrastructure MCP"
ZH: "MCP 基础设施专家"
```

---

## Phase 2 — Navigation Cross-Site (Le Pont Dev→CTO)

**Effort total estimé :** 2-3 jours
**Impact :** Stratégique

### Step 5 : Ajouter "Work With Us" dans les headers sous-sites [DONE ✅]

> **Implementation note (2026-02-08):** Lien "Work With Us" ajouté dans les 3 headers (EngineHeader, McpServerHeader, McpStdHeader). Trilingue, icône handshake Material Symbols, accent color `var(--md-sys-color-primary)` en light + `var(--casys-warm-accent)` en dark. Présent dans le desktop nav ET le mobile menu.

**Fichiers :**
- `lib/casys-hub-vitrine/src/features/engine/EngineHeader.astro`
- `lib/casys-hub-vitrine/src/features/mcp-server/McpServerHeader.astro`
- `lib/casys-hub-vitrine/src/features/mcp-std/McpStdHeader.astro`

**Problème :** Un dev sur `engine.casys.ai` qui est impressionné par la tech n'a pas de chemin visible vers le consulting (`casys.ai/#work-with-us`). Le pont dev→CTO est cassé.

**Action :** Ajouter un lien "Work With Us" / "Need help?" dans la nav de chaque header de sous-site, pointant vers `https://casys.ai/#work-with-us`.

```astro
<!-- Ajouter après les liens existants, avant le GitHub link -->
<a href="https://casys.ai/#work-with-us" class="nav-link consulting-link">
  <span class="material-symbols-rounded">handshake</span>
  {t.workWithUs}
</a>
```

Style : accentué avec `var(--md-sys-color-primary)` (#FFB86F) pour le différencier des autres liens nav.

Traductions :
```
EN: "Need help?" or "Work With Us"
FR: "Besoin d'aide ?" or "Travaillons ensemble"
ZH: "需要帮助？" or "合作咨询"
```

### Step 6 : Product switcher breadcrumb (futur)

**Note :** Le designer du panel a proposé un product switcher dans le breadcrumb pour naviguer facilement entre les sous-sites. Ceci est plus complexe et peut être implémenté après les quick wins. Pattern recommandé :

```
casys.ai > Engine > Docs
           ↓ (dropdown)
           ├─ PML Engine
           ├─ @casys/mcp-server
           ├─ @casys/mcp-std
           └─ PML Gateway
```

Ce step est optionnel pour cette spec — peut être promu en spec dédiée si la navigation s'avère confuse après les steps 1-5.

---

## Phase 3 — Factorisation Technique

**Effort total estimé :** 1-2 semaines
**Impact :** Maintenance long terme

### Step 7 : Intégrer la palette warm dark mode dans le design system M3 [DONE ✅]

> **Implementation note (2026-02-08):**
> - **7a** ✅ : 20+ tokens warm ajoutés dans `m3-colors-generated.css` (background, surface, text-primary/secondary/dim/muted, accent/hover, teal, success, info, error, borders). Build regénéré avec `node build.js`.
> - **7b** ✅ : `styles.css` migré de `#FFB86F` hardcodé vers `var(--casys-warm-accent)`.
> - **7c** ✅ : 160 hex remplacés dans 10 composants landing-v2 (Hero, SocialProof, WorkWithUs, WhatWeDo, Projects, WhyCasys, Blog, FAQ, FinalCta, Contact). Les rgba() opacités et couleurs hors mapping intentionnellement conservées.
> - **7d** ✅ : 85+ hex remplacés dans 4 islands catalog (CatalogPageIsland, ToolDetailPanel, CapabilityDetailPanel, SchemaViewer). Option A (CSS vars dans Tailwind arbitrary) utilisée. 4 hex restants (#0c0c0e, #111114, #141418) sans équivalent token.

**Problème dual :**

Le site utilise **deux palettes de couleur distinctes** selon le mode :
- **Light mode** : correctement branché sur les tokens M3 (`var(--md-sys-color-*)`) — palette violet issue de `#dbbddb`
- **Dark mode** : palette warm/orange **hardcodée** dans chaque composant (`#FFB86F`, `#0a0908`, `#f5f0ea`, `#d5c3b5`)

Les tokens expressifs M3 (`--casys-gradient-*`, `--casys-text-*`, `--casys-surface-*`) existent dans le générateur mais sont dérivés de la palette violet — ils ne correspondent PAS à la palette warm utilisée sur le site.

La palette warm dark est en réalité consistante (5 couleurs de base + extensions), utilisée dans **tous** les composants landing-v2 et les sous-sites, mais n'est déclarée nulle part comme source de vérité.

**Diagnostic des 87+ hardcodes :**

| Zone | Palette utilisée | Problème |
|------|-----------------|----------|
| Landing V2 (10 composants `.astro`) | Warm dark (`#FFB86F`, `#0a0908`...) dans les blocs `html[data-theme="dark"]` | Pas de tokens, tout en hex |
| Catalog islands (4 fichiers `.tsx`) | Warm dark + couleurs sémantiques (`#4ECDC4` teal, `#4ade80` success) en Tailwind arbitrary values | Pas de tokens, + mélange |
| `styles.css` | 2x `#FFB86F` hardcodé pour `.accent-text` | Devrait utiliser un token |

#### 7a. Ajouter les tokens warm dans le design system M3

**Fichier :** `packages/design-system/tokens/m3-colors-generated.css` (section `[data-theme="dark"]`)

Ajouter les tokens warm **à côté** des tokens expressifs existants, dans le bloc `[data-theme="dark"]` :

```css
[data-theme="dark"] {
  /* ... tokens M3 existants (primary, surface, etc.) ... */
  /* ... tokens expressifs existants (--casys-gradient-*, etc.) ... */

  /* === WARM DARK PALETTE (landing & marketing pages) === */
  /* Manually curated palette — not derived from M3 source color */

  /* Warm backgrounds (neutral-warm, not purple-tinted) */
  --casys-warm-background: #0a0908;        /* Section backgrounds */
  --casys-warm-surface: #1a1815;           /* Card backgrounds */
  --casys-warm-surface-elevated: #0f0f12;  /* Elevated panels */

  /* Warm text hierarchy */
  --casys-warm-text-primary: #f5f0ea;      /* Headings, high-emphasis text */
  --casys-warm-text-secondary: #d5c3b5;    /* Subtitles, medium-emphasis */
  --casys-warm-text-dim: #6b6560;          /* Low-emphasis text */
  --casys-warm-text-muted: #a8a29e;        /* Disabled / placeholder */

  /* Warm accent (brand orange) */
  --casys-warm-accent: #FFB86F;            /* Primary accent */
  --casys-warm-accent-hover: #D4A574;      /* Hover state */

  /* Semantic colors (catalog-specific) */
  --casys-warm-teal: #4ECDC4;             /* Secondary accent / status */
  --casys-warm-success: #4ade80;          /* Success states */
  --casys-warm-info: #60a5fa;             /* Info / links */
  --casys-warm-error: #f87171;            /* Error states */

  /* Warm borders */
  --casys-warm-border-dim: #2a2a2e;       /* Subtle separators */
  --casys-warm-border-subtle: #1a1a1e;    /* Very subtle */
}
```

Puis regénérer le build : `cd packages/design-system && pnpm build`

**Note importante :** NE PAS modifier les tokens M3 standard (`--md-sys-color-*`) — la palette violet reste la source de vérité M3. Les tokens warm sont un **layer additionnel** pour le thème dark du site marketing.

#### 7b. Corriger `styles.css`

**Fichier :** `lib/casys-hub-vitrine/src/styles.css`

```css
/* Avant */
.accent-text { color: #FFB86F; }
[data-theme="dark"] .accent-text { color: #FFB86F; }

/* Après */
.accent-text { color: var(--md-sys-color-primary); }
[data-theme="dark"] .accent-text { color: var(--casys-warm-accent); }
```

#### 7c. Refactoriser progressivement les composants landing-v2

**Pattern de remplacement dans les composants Astro** (Hero, Blog, SocialProof, WhyCasys, Contact, FinalCta, WhatWeDo) :

```css
/* Avant — hardcoded hex dans chaque composant */
html[data-theme="dark"] .section { background: #0a0908; }
html[data-theme="dark"] .title { color: #f5f0ea; }
html[data-theme="dark"] .subtitle { color: #d5c3b5; }
html[data-theme="dark"] .accent { color: #FFB86F; }
html[data-theme="dark"] .cta-primary { background: #FFB86F; }
html[data-theme="dark"] .cta-primary:hover { background: #D4A574; }

/* Après — tokens du design system */
html[data-theme="dark"] .section { background: var(--casys-warm-background); }
html[data-theme="dark"] .title { color: var(--casys-warm-text-primary); }
html[data-theme="dark"] .subtitle { color: var(--casys-warm-text-secondary); }
html[data-theme="dark"] .accent { color: var(--casys-warm-accent); }
html[data-theme="dark"] .cta-primary { background: var(--casys-warm-accent); }
html[data-theme="dark"] .cta-primary:hover { background: var(--casys-warm-accent-hover); }
```

Ordre de refactorisation (par nombre de hardcodes dark) :
1. `Hero.astro` (~20 hardcodes dark)
2. `WhyCasys.astro` (~15 hardcodes dark)
3. `SocialProof.astro` (~15 hardcodes dark)
4. `Blog.astro` (~12 hardcodes dark)
5. `Contact.astro` (~12 hardcodes dark)
6. `FinalCta.astro` (~10 hardcodes dark)
7. `WhatWeDo.astro` (~8 hardcodes dark)

#### 7d. Refactoriser les islands catalog (Preact)

Les islands Preact utilisent des classes Tailwind arbitrary (`bg-[#0a0a0c]`) et du style inline.
Deux approches possibles :

**Option A : CSS custom properties via `var()` dans les classes Tailwind**
```tsx
// Avant
<div className="bg-[#0a0a0c] text-[#4ECDC4]">

// Après (Tailwind arbitrary values avec CSS vars)
<div className="bg-[var(--casys-warm-background)] text-[var(--casys-warm-teal)]">
```

**Option B : Style inline via un helper JS** (si les CSS vars ne sont pas accessibles au build time dans les islands)
```typescript
// src/islands/catalog/theme.ts
// Re-export des valeurs pour usage JS dans les islands Preact
// Ces valeurs DOIVENT rester synchronisées avec packages/design-system/tokens/m3-colors-generated.css
export const warmDark = {
  accent: '#FFB86F',
  accentHover: '#D4A574',
  teal: '#4ECDC4',
  success: '#4ade80',
  info: '#60a5fa',
  error: '#f87171',
  bg: '#0a0908',
  bgCard: '#0a0a0c',
  bgElevated: '#0f0f12',
  textPrimary: '#f5f0ea',
  textSecondary: '#d5c3b5',
  textDim: '#6b6560',
  borderDim: '#2a2a2e',
} as const;
```

**Préférer l'Option A** (CSS vars) quand possible — c'est la source de vérité unique.
L'Option B n'est nécessaire que si les islands doivent accéder aux valeurs en JS (calculs dynamiques, canvas, etc.).

Ordre de refactorisation (par nombre de hardcodes) :
1. `CatalogPageIsland.tsx` (40+ hardcodes)
2. `ToolDetailPanel.tsx` (19 hardcodes)
3. `CapabilityDetailPanel.tsx` (16 hardcodes)
4. `SchemaViewer.tsx` (10 hardcodes)

### Step 8 : Factoriser les composants cross-site dupliqués

**Problème :** ~2500 lignes dupliquées entre engine/, mcp-server/, mcp-std/ (layouts, headers, heroes, install sections).

**Composants à créer :**

| Priorité | Nouveau composant | Remplace | Lignes économisées |
|----------|-------------------|----------|---------------------|
| 1 | `SubsiteLayout.astro` | EngineLayout, McpStdLayout, McpServerLayout | ~300 |
| 2 | `SubsiteHeader.astro` | EngineHeader, McpStdHeader, McpServerHeader | ~1200 |
| 3 | `FeatureHeroSection.astro` | engine/Hero, mcp-std/Hero, mcp-server/Hero | ~780 |
| 4 | `InstallSection.astro` (partagé) | mcp-std/Install, mcp-server/Install | ~200 |

#### 8a. SubsiteLayout.astro

**Fichier :** `lib/casys-hub-vitrine/src/components/SubsiteLayout.astro`

```astro
---
interface Props {
  title: string;
  metaDescription: string;
  ogImage?: string;
}
const { title, metaDescription, ogImage } = Astro.props;
---
<!DOCTYPE html>
<html lang={Astro.currentLocale ?? 'en'}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>{title}</title>
  <meta name="description" content={metaDescription} />
  <!-- Shared fonts, analytics, theme sync -->
  <slot name="head" />
</head>
<body>
  <slot name="header" />
  <slot />
  <SubsiteFooter />
</body>
</html>
```

Les 3 layouts existants deviennent :
```astro
---
import SubsiteLayout from '../../components/SubsiteLayout.astro';
import EngineHeader from './EngineHeader.astro';
---
<SubsiteLayout title="PML Engine" metaDescription="...">
  <EngineHeader slot="header" />
  <slot />
</SubsiteLayout>
```

#### 8b. SubsiteHeader.astro

**Fichier :** `lib/casys-hub-vitrine/src/components/SubsiteHeader.astro`

Props :
```typescript
interface Props {
  branding: { name: string; tagline: string; logo?: string };
  navLinks: Array<{ href: string; label: string; external?: boolean }>;
  docsUrl?: string;
  githubUrl: string;
  jsrUrl?: string;
}
```

Contient : brand section + desktop nav + mobile menu overlay + toggle JS + CSS.
Les 3 headers existants passent leurs données spécifiques via props.

#### 8c. FeatureHeroSection.astro

Props :
```typescript
interface Props {
  sectionId: string;
  tagline: string;
  title: string;       // Peut contenir HTML pour styling
  subtitle: string;
  stats: Array<{ value: string; label: string }>;
  cta: { primary: { text: string; url: string }; secondary: { text: string; url: string } };
  terminalContent: string;  // HTML du terminal
}
```

#### 8d. InstallSection.astro

Props :
```typescript
interface Props {
  commands: Array<{ label: string; command: string }>;
  links: Array<{ label: string; url: string; icon?: string }>;
  title: string;
}
```

---

## Phase 4 — Contenu SEO & Portfolio

**Effort total estimé :** 2-4 semaines
**Impact :** Stratégique (long terme)

### Step 9 : Page pilier "What is MCP" (optionnel)

Le SEO expert du panel recommande de créer une page pilier sur casys.ai qui explique MCP, positionne Casys comme expert, et cible les requêtes informatives ("what is MCP", "MCP server tutorial", "model context protocol explained").

**Format recommandé :** Page Astro statique ou article de blog long-form (~2000 mots) avec :
- Introduction à MCP
- Exemples concrets
- Liens vers les sous-sites comme "voir en pratique"
- CTA vers le consulting

**Note :** Ce step est optionnel et peut être implémenté comme un article de blog MDX plutôt qu'une page dédiée.

### Step 10 : Page "Our Work" / Portfolio (optionnel)

Pour remplacer la social proof manquante, créer une page `/work` ou `/portfolio` avec :
- 2-3 case studies anonymisés (même si fictifs mais réalistes)
- Méthodologie Casys (discovery → architecture → implementation → handoff)
- Stack technique utilisée
- Durée typique d'engagement

**Note :** Ce step est bloqué tant qu'il n'y a pas de vrais cas clients à montrer. Peut être dépriorisé.

---

## Implementation Order

```
Phase 1 (Quick Wins - 1 jour) ✅ DONE
├── Step 1: Hero redesign ✅ DONE (Editorial Authority layout, 0 JS, centered)
├── Step 1b: Hero → Editorial Authority rewrite ✅ DONE (Fraunces serif, proof bar, kicker SEO)
├── Step 2: SocialProof ✅ DONE (placeholder retiré, GitHub repo cards ajoutées)
├── Step 3: WorkWithUs ✅ DONE (clarification free/OSS vs paid consulting)
├── Step 3b: Remove Free/Paid badges ✅ DONE (trop "commodity" pour consulting)
└── Step 4: SEO basics ✅ DONE (astro.config site, robots.txt, footer tagline)

Phase 2 (Navigation - 2-3 jours) ✅ DONE
├── Step 5: "Work With Us" link dans headers sous-sites ✅ DONE (3 headers, trilingue)
└── Step 6: Product switcher (optionnel, peut être spec dédiée)

Phase 3 (Factorisation - 1-2 semaines) 🔄 EN COURS
├── Step 7a: Tokens warm dans design system ✅ DONE (m3-colors-generated.css + build)
├── Step 7b: styles.css tokens ✅ DONE (#FFB86F → var(--casys-warm-accent))
├── Step 7c: Landing-v2 dark mode tokens ✅ DONE (160 hex → tokens, 10 fichiers)
├── Step 7d: Catalog islands tokens ✅ DONE (85+ hex → tokens, 4 fichiers)
├── Step 8: Factoriser composants cross-site ✅ DONE (4 shared components, 12 thin wrappers, build OK)
└── Step 8b: Centraliser i18n ✅ DONE (37/37 fichiers migrés, 0 inline translations restantes)

Phase 4 (Contenu SEO - 2-4 semaines)
├── Step 9: Page pilier "What is MCP" (optionnel)
└── Step 10: Portfolio / Case studies (optionnel)
```

## Risks & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| La factorisation cross-site (Phase 3) casse des sous-sites | Moyen | Tester chaque sous-site après extraction. Un composant à la fois. |
| Les métriques GitHub dans SocialProof deviennent obsolètes | Bas | Actualiser lors de chaque release. À terme, fetch dynamique via GitHub API. |
| Le changement de H1 impacte le SEO existant | Bas | "Applied AI Research" n'avait aucune valeur SEO. Le nouveau H1 avec "MCP" est strictement meilleur. |
| La migration i18n (hors scope) bloque les traductions | Moyen | ✅ RÉSOLU — Step 8b: système centralisé `src/i18n/` créé, migration en cours (21/37 → 37/37). |

## Dependencies

- **Aucune dépendance externe** pour les Phases 1-2
- **Phase 3** dépend de la validation visuelle de chaque sous-site après factorisation
- **Phase 4** dépend du contenu (rédaction case studies, recherche SEO keywords)

## Acceptance Criteria

### Phase 1 ✅
- [x] Le H1 contient "MCP" dans les 3 langues
- [x] Le stat "MIT Licensed" est remplacé
- [x] Le CTA primary pointe vers #work-with-us
- [x] Aucun texte placeholder "testimonials coming" visible
- [x] WorkWithUs mentionne explicitement "free and open-source" pour les outils
- [x] `robots.txt` existe et pointe vers le sitemap
- [x] `astro.config.mjs` a la propriété `site`
- [x] Le footer dit "MCP Infrastructure Expertise" (pas "Applied AI Research")
- [x] Badges Free/Paid retirés de WorkWithUs (décision: trop commodity pour consulting)

### Phase 2 ✅
- [x] Chaque header de sous-site a un lien visible vers `casys.ai/#work-with-us`
- [x] Le lien est accentué visuellement (couleur primary + icône handshake)
- [x] Trilingue (EN: "Work With Us", FR: "Travaillons ensemble", ZH: "合作咨询")

### Phase 3 🔄
- [x] Les tokens `--casys-warm-*` existent dans `packages/design-system/tokens/m3-colors-generated.css`
- [x] `styles.css` utilise `var(--casys-warm-accent)` au lieu de `#FFB86F`
- [x] Les composants landing-v2 dark mode utilisent `var(--casys-warm-*)` (160 remplacements, 10 fichiers)
- [x] `CatalogPageIsland.tsx` utilise les tokens warm (CSS vars Option A, 85+ remplacements)
- [x] `ToolDetailPanel.tsx`, `CapabilityDetailPanel.tsx`, `SchemaViewer.tsx` migrés vers tokens
- [x] `SubsiteLayout.astro` remplace les 3 layouts dupliqués ✅ (97 lignes, thin wrappers)
- [x] `SubsiteHeader.astro` remplace les 3 headers dupliqués ✅ (473 lignes, thin wrappers)
- [x] `SubsiteHero.astro` remplace les 3 heroes dupliqués ✅ (361 lignes, thin wrappers)
- [x] `SubsiteInstallSection.astro` remplace les 2 install sections ✅ (224 lignes, thin wrappers)
- [x] Les 3 sous-sites (engine, mcp-std, mcp-server) fonctionnent identiquement après factorisation ✅
- [x] `npx astro build` passe sans erreur ✅

### Step 8b : i18n Centralization 🔄
- [x] Système centralisé créé : `src/i18n/` (index.ts + en.ts + fr.ts + zh.ts)
- [x] Landing-v2 : 11 sections migrées vers `useTranslations()`
- [x] Shared components : Header, Footer, SubsiteFooter migrés
- [x] Sous-sites : 8 thin wrappers (headers, heroes, install) migrés
- [x] PML Landing : 8 sections (Hero, Architecture, CatalogPreview, QuickStart, Isolation, BetaSignup, Cta, Intelligence) ✅
- [x] Engine sections : 3 (LinksSection, BenchmarksSection, HowItWorksSection) ✅
- [x] MCP-Server sections : 4 (ComparisonSection, FeaturesSection, PipelineSection, QuickStartSection) ✅
- [x] MCP-Std sections : 2 (QuickStartSection, CategoriesSection) ✅
- [x] `npx astro build` passe après migration complète ✅ (0 inline translations, 39 fichiers utilisent useTranslations())
