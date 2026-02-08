# Casys AI UX Design Specification

_Created on 2025-11-15 (Last Updated: 2025-11-15)_
_Updated by Erwzn_
_Generated using BMad Method - Create UX Design Workflow v1.0_

---

## Executive Summary

**Projet:** Casys - Applied AI Research

**Vision:** Research lab exploring AI architectures across multiple domains (knowledge management, agentic systems, databases). We build open-source tools (MIT), publish research, and help teams when needed.

**Approche Hybride:**
- **Open Source**: MIT licensed projects (MCP Gateway, CasysDB)
- **Research & Knowledge Sharing**: Publications, workshops, talks
- **Consulting**: Architecture & implementation help (€800-1,200/day)

**Target Users:** CTOs, tech leads, researchers, developers interested in multi-domain AI systems

**Objectif du Site Vitrine:** Homepage positionnant Casys comme research lab multi-projets, avec messaging factuel, direct, no bullshit.

---

## 1. Project Understanding and Users

### 1.1 Project Vision Confirmed

**Projet:** Casys - Applied AI Research

**Utilisateurs cibles:**
- **Primaire:** CTOs, Tech Leads, Engineering Managers (mid-market companies)
- **Secondaire:** Developers/Architects interested in AI systems
- **Tertiaire:** Researchers, Students
- **Quaternaire:** Investors/Partners

**Expertise historique:** 10+ ans - Knowledge Management (2013) → Graph DBs → DAGs → Agentic Systems → Multi-domain AI

**Projets:**
- **Active:** Casys MCP Gateway, CasysDB
- **Archived:** Living Content Ecosystem, Solo RPG

**Modèle:** Hybrid - Open Source (MIT) + Research + Consulting

**Voix de la marque:**
- Direct, factuel, no bullshit
- Curious & exploratory (research lab vibe)
- Multi-domain (not locked into one buzzword)
- Humble about expertise (10+ years = fact, not brag)
- Practical (we ship production systems)
- Open (MIT license, share research)

**Différences vs version précédente (AgentsCards-focused):**
- ❌ Pas de focus unique sur AgentsCards/MCP Gateway
- ✅ Section Projects dédiée pour tous projets
- ✅ Research first (pas Product first)
- ✅ Multi-domain positioning
- ❌ Pas de pricing section (freemium pas lancé)

---

## 2. Core User Experience

### 2.1 Defining Experience

**Primary User Action:** Understand the multi-domain research lab positioning immediately

**One Thing:** Visitors must instantly grasp "Applied AI Research" across multiple domains and see how they can engage (Tools / Consulting / Research).

**Platform:** Web only (desktop + mobile responsive)

**Core Experience Principles:**
- **Speed:** Instant comprehension (research lab with multiple projects)
- **Guidance:** Clear paths to 3 engagement options (Tools / Consulting / Follow Research)
- **Flexibility:** Users choose their level of engagement
- **Clarity:** Multi-domain but not confusing
- **Authenticity:** No bullshit corporate speak, humble about expertise

**Key Differences vs Previous Version:**
- Old: "Context Management for Agentic Systems" (single focus)
- New: "Applied AI Research" (multi-domain)
- Old: Product first (AgentsCards)
- New: Research first (exploration across domains)

---

## 3. Design System Foundation

### 3.1 Design System Choice

**System:** Material Design 3 Full Expressive 2026 BLACK

**Why MD3 Full Expressive 2026:**
- **Dark Mode First**: Pure BLACK backgrounds pour maximum contrast et impact visuel
- **Glassmorphism Premium**: Backdrop filters pour effet de profondeur et sophistication
- **Violet Accent System**: Borders et accents violets cohérents avec l'identité CASYS
- Plus de personnalité que M3 standard avec surfaces expressives
- Adapté pour landing pages marketing premium tout en gardant cohérence système

**Architecture:**
- **Tier 1**: MD3 Full Expressive tokens base (Dashboard, UI standard)
- **Tier 2**: Custom CASYS tokens (Landing pages marketing - style BLACK 2026)
- **Tier 3**: Dark Mode Pattern centralisé (glassmorphism + pure black backgrounds)

**Couleurs Brand:**
- Source: `#dbbddb` (violet clair du logo CASYS)
- Palette M3 auto-générée via @material/material-color-utilities
- Primary light: `#83468f` / Primary dark: `#f5adfe`

**Tokens Custom CASYS (Dark Mode):**
- **Backgrounds**: `--casys-background-dark: #000000` (pure black)
- **Gradients saturés**: `--casys-gradient-start: #fac2ff`, `--casys-gradient-mid: #c8b2c7`, `--casys-gradient-end: #ffc7c0`
- **Surfaces elevated**: `--casys-surface-elevated: #282528`
- **Borders avec opacity**: `--casys-border-subtle/medium/strong`

**Utility Classes:**
- `.gradient-text-enhanced` - Gradient text pour titres impactants (utiliser parcimonieusement)
- `.surface-elevated` - Containers avec background distinct + border + shadow
- `.card-elevated` - Cards avec profondeur visuelle (hover state)
- `.input-enhanced` - Input fields avec focus glow

**Decision:** Migration vers MD3 Full Expressive 2026 BLACK pour toutes les sections de la landing page. Pattern dark mode cohérent avec glassmorphism et backgrounds noirs purs.

**Styling Philosophy for Research Lab Vibe:**
- **Dark Mode First**: Pure black backgrounds pour professionalism et contraste maximum
- **Gradient text**: Utiliser parcimonieusement (sobre, pas marketing)
- **Colors semantic**: Primary (Research), Secondary (Open Source), Tertiary (Consulting)
- **Typography**: Font-weight équilibré pour ton humble mais professionnel
- **Glassmorphism**: Effet premium sans surcharge visuelle

---

### 3.2 Color Palette - MD3 Full Expressive 2026 BLACK

**Philosophy:** Pure BLACK backgrounds with violet glassmorphic accents for maximum contrast and visual impact.

#### Dark Mode Colors

**Backgrounds:**
- **Primary Background**: `#000000` (pure black) - `var(--casys-background-dark)`
- **Card Background**: `rgba(0, 0, 0, 0.6)` with glassmorphism
- **Card Hover**: `rgba(0, 0, 0, 0.7)` with enhanced glassmorphism

**Borders:**
- **Normal State**: `rgba(250, 194, 255, 0.2)` (violet transparent)
- **Hover State**: `rgba(250, 194, 255, 0.4)` (violet semi-transparent)

**Gradient CASYS:**
- **Start**: `#FAC2FF` (violet) - `var(--casys-gradient-start)`
- **Mid**: `#C8B2C7` (muted violet-grey) - `var(--casys-gradient-mid)`
- **End**: `#FFC7C0` (peach) - `var(--casys-gradient-end)`

**Text:**
- **Primary**: `var(--casys-text-primary)` (near-white, high contrast)
- **Secondary**: `var(--casys-text-secondary)` (muted grey, readable)
- **Accent**: `var(--casys-gradient-start)` (#FAC2FF - violet pour icons et highlights)

#### Glassmorphism Effects

**Standard Blur:**
```css
backdrop-filter: blur(16px) saturate(180%);
-webkit-backdrop-filter: blur(16px) saturate(180%);
```

**Enhanced Blur (Hover):**
```css
backdrop-filter: blur(20px) saturate(200%);
-webkit-backdrop-filter: blur(20px) saturate(200%);
```

---

### 3.3 Dark Mode Pattern - MD3 Full Expressive 2026 BLACK

**Philosophy:** Pure BLACK backgrounds with violet glassmorphic accents for maximum contrast and visual impact.

#### Card Pattern (Standard)

**Normal State:**
```css
background: rgba(0, 0, 0, 0.6);
border: 1px solid rgba(250, 194, 255, 0.2);
backdrop-filter: blur(16px) saturate(180%);
-webkit-backdrop-filter: blur(16px) saturate(180%);
border-radius: 24px;
transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

**Hover State:**
```css
background: rgba(0, 0, 0, 0.7);
border-color: rgba(250, 194, 255, 0.4);
backdrop-filter: blur(20px) saturate(200%);
-webkit-backdrop-filter: blur(20px) saturate(200%);
transform: translateY(-4px) scale(1.01);
box-shadow: 0 8px 32px rgba(250, 194, 255, 0.15);
```

#### Section Background

```css
background: var(--casys-background-dark); /* #000000 pure */
padding: 80px 0;
position: relative;
```

#### Text Hierarchy

**Titles (H1-H3):**
```css
color: var(--casys-text-primary);
font-weight: 600;
letter-spacing: -0.02em;
```

**Body/Descriptions:**
```css
color: var(--casys-text-secondary);
font-weight: 400;
line-height: 1.6;
```

**Accents/Icons:**
```css
color: var(--casys-gradient-start); /* #FAC2FF violet */
```

#### Glassmorphism Implementation

**All Cards Use:**
- `backdrop-filter: blur(16px) saturate(180%)` (normal state)
- `-webkit-backdrop-filter: blur(16px) saturate(180%)` (Safari support)
- Increased on hover: `blur(20px) saturate(200%)`
- Semi-transparent black background for depth
- Violet borders for brand consistency

#### Why This Works

**Maximum Contrast:**
- Pure black backgrounds make violet accents pop
- Text readability maximized with high contrast ratios
- Visual hierarchy immediately clear

**Premium Feel:**
- Glassmorphism adds depth and sophistication
- Smooth transitions create polished experience
- Hover effects provide tactile feedback

**Consistency:**
- Every section follows the same pattern
- Predictable user experience
- Easy to maintain and extend

**Performance:**
- Simple colors (pure black)
- GPU-accelerated filters
- Optimized transitions

**Accessibility:**
- High contrast ratios for WCAG AA compliance
- Clear visual hierarchy
- Readable text at all sizes

---

### 3.4 Technical Implementation Notes

#### Astro CSS Scoping Fix

**Challenge:** Astro's CSS scoping can interfere with dark mode styles when defined in individual components.

**Solution:** Dark mode styles centralisés dans `LandingLayout.astro` (lignes 193-520)

**Implementation:**
```astro
<style is:inline>
  /* Global dark mode styles - non-scoped */
  /* Applied to all landing page sections */
  /* Ensures consistent styling across components */
</style>
```

**Why `is:inline`:**
- Prevents Astro CSS scoping issues
- Ensures styles apply globally to all sections
- Maintains consistency across component boundaries
- Critical for dark mode pattern implementation

#### Sections Using MD3 Full Expressive 2026 BLACK Pattern

**All Landing Page Sections (15 total):**
1. Hero
2. Projects
3. WhatWeDo
4. WhyCasys
5. HowItWorks
6. Benefits
7. UseCases
8. ProblemSolution
9. WorksWith
10. Pricing
11. FAQ
12. WorkWithUs
13. SocialProof
14. FinalCta
15. Contact
16. Footer

**Pattern Consistency:**
- All sections use `background: var(--casys-background-dark)`
- All cards use `rgba(0, 0, 0, 0.6)` with glassmorphism
- All borders use `rgba(250, 194, 255, 0.2)` → hover `0.4`
- All hover states use `translateY(-4px) scale(1.01)`
- All use centralized styles from `LandingLayout.astro`

---

## 4. Refonte Landing Page

### 4.1 Document de Référence

**Document complet:** [REFONTE-LANDING-PAGE.md](./REFONTE-LANDING-PAGE.md)

Ce document contient tous les textes EN/FR, notes d'implémentation, et guidelines pour la refonte.

### 4.2 Sections Principales

**Structure (mise à jour):**

1. **Hero** (adapté) - Nouveau positionnement "Applied AI Research", 3 CTAs
2. **WhatWeDo** (adapté) - 3 piliers Research/Open Source/Consulting
3. **Projects** (NOUVEAU) - Section dédiée tous projets (Active + Archived)
4. **WhyCasys** (adapté de WhyCasysAI) - Multi-domain differentiation
5. **WorkWithUs** (adapté) - 4 options (Tools/Consulting/Training/Research)
6. **SocialProof** (adapté) - Building in public stats
7. **FAQ** (adapté) - Questions multi-projets
8. **Contact** (garder)
9. **FinalCta** (adapté) - Nouveau wording

**Sections supprimées:**
- ❌ SegmentSelector (plus besoin teams/agencies)
- ❌ Pricing (freemium pas encore lancé)
- ❌ WorksWith (pas de focus MCP logos)
- ❌ WhyAgentsCards (remplacé par Projects)

---

## 5. Page Sections Deep Dive

### 5.1 Hero Section

**Objectif:** Communiquer "Applied AI Research" immédiatement

**Layout:**
- Title: "Applied AI Research" (sobre, pas de gradient sauf si vraiment besoin)
- Subtitle: "We explore AI architectures, build open-source tools, and share what we learn."
- Trust badges: "Current projects: MCP Gateway • CasysDB" / "10+ years: KM → Graphs → Agents"
- 3 CTAs: "Explore Projects" (primary) + "Consulting" + "Follow Research" (secondary)
- 3 preview items (key messages)

**UX Principles:**
- Instant clarity: "research lab" vibe
- Multi-domain positioning visible
- 3 engagement paths clear
- Sobre, pas de carousel ou tabs

**Components:**
- Hero container (`.surface-elevated`)
- Title (h1)
- Subtitle (p)
- Trust badges (inline text)
- CTA group (primary + 2 secondary buttons)
- Preview items (3 badges ou chips)

---

### 5.2 WhatWeDo Section

**Objectif:** Présenter les 3 piliers Research / Open Source / Consulting

**Layout:** 3 colonnes (cards) desktop, stack mobile

**Structure:**

1. **Research & Exploration** (Primary color)
   - 4 research areas (KM, Agentic, Content, Databases)
   - Philosophy (3 points)
   - CTA: "See Research Areas"

2. **Open Source Projects** (Secondary color)
   - 2 active projects (MCP Gateway, CasysDB)
   - Approach (3 points)
   - CTA: "Explore Projects"

3. **Consulting & Knowledge Sharing** (Tertiary color)
   - 3 services
   - Approach (4 points)
   - Knowledge sharing (3 channels)
   - CTA: "Book a Call"

**UX Principles:**
- Research first (not Product first)
- Equal weight to 3 pillars
- CTAs clear for each pillar
- Factual, no hype

**Components:**
- 3 cards (`.card-elevated`)
- Icons (Material Icons)
- Lists (research areas, services, etc.)
- CTAs (outline buttons)

---

### 5.3 Projects Section (NOUVEAU)

**Objectif:** Présenter tous les projets (Active + Archived)

**Layout:**
- Active Projects: 2 grandes cards (MCP Gateway, CasysDB)
- Archived Projects: 2 petites cards/badges (Living Content, Solo RPG)

**Structure Active Project Card:**
- Header: Name, Tagline, Status badge, License badge
- Problem section (3 points)
- Solution section (3-4 features avec icons)
- Results (3 stats grandes et visibles)
- Tech stack (inline tags)
- Links: GitHub, Docs, Website

**Structure Archived Project Card:**
- Name, Tagline, Status badge
- Description (1 paragraph)
- Learnings (4 points)
- Links (optionnel)

**UX Principles:**
- Active projects very visible (large cards)
- Archived projects present but secondary (small cards/badges)
- Problem/Solution clear for active projects
- Stats impressive but factual
- All MIT licensed clearly stated

**Components:**
- Project cards large (`.project-card.card-elevated`)
- Project cards small (`.project-card.archived`)
- Status badges (`.status-badge.active` / `.archived`)
- License badges (`.license-badge.mit`)
- Stats displays (large numbers with labels)
- Tech stack tags (inline)

---

### 5.4 WhyCasys Section

**Objectif:** Différenciation multi-domaine

**Layout:** 5 avantages en grid (2-3 colonnes desktop)

**5 Differentiators:**

1. **Multi-Domain Expertise**
   - Timeline 2013-2025 (visual)
   - Cross-pollination benefit

2. **10+ Years Continuity**
   - Track record
   - Not AI newcomers

3. **Open Source First**
   - MIT licensed everything
   - Philosophy: Share research, monetize expertise

4. **Practical Research**
   - Ship production systems
   - Research → Tool → Production cycle

5. **Mid-Market Accessible**
   - €800-1,200/day pricing
   - No corporate overhead

**UX Principles:**
- Factual, humble (not arrogant)
- Timeline visual for evolution
- Each differentiator backed by proof
- Bottom line callout box

**Components:**
- 5 differentiator cards (`.card-elevated`)
- Timeline component (visual 2013-2025)
- Icons (Material Icons)
- Bottom line callout (`.surface-elevated`)
- CTA: "See If We're a Fit"

---

### 5.5 WorkWithUs Section

**Objectif:** 4 options d'engagement claires

**Layout:** 4 options en grid (2x2 desktop, stack mobile)

**4 Options:**

1. **Use Our Open Source Tools**
   - List projects (MCP Gateway, CasysDB, future)
   - CTA: "Explore on GitHub"

2. **Consulting Services**
   - List services (6 items)
   - Typical engagements (3 examples avec pricing)
   - CTA: "Book a Call"

3. **Training & Workshops**
   - 3 programs (duration, audience)
   - Delivery modes (3)
   - Partners (Alegria, French Tech Taiwan)
   - CTA: "Request Training"

4. **Follow Our Research**
   - 4 channels (LinkedIn, Blog, GitHub, Talks)
   - CTA: "Follow on LinkedIn"

**UX Principles:**
- All visible (no tabs, everything shown)
- Equal weight to 4 options
- Clear CTAs for each
- Simple (no complex pricing tiers)

**Components:**
- 4 option cards (`.card-elevated`)
- Icons (Material Icons)
- Lists (services, programs, channels)
- CTAs (primary button per card)

---

### 5.6 SocialProof Section

**Objectif:** Building in public stats

**Layout:** 4 stat cards

**4 Stats:**
1. **2 Active Projects** - MCP Gateway + CasysDB
2. **10+ Years Experience** - KM → Graphs → Agents
3. **MIT Open Source** - All projects freely available
4. **French Tech Taiwan** - Active community member

**UX Principles:**
- Humble (building in public, not bragging)
- Each stat has link to more info
- No testimonials (placeholder avec CTA)
- Factual, no hype

**Components:**
- 4 stat cards (`.stat-card.card-elevated`)
- Icons (Material Icons)
- Links to GitHub, About, Projects
- Testimonials placeholder (callout box)

---

### 5.7 FAQ Section

**Objectif:** Questions multi-projets

**Layout:** Accordions groupés par catégorie

**4 Categories:**
1. **General** (3 questions) - What is Casys? Different from others? For whom?
2. **Projects** (3 questions) - What projects? Use for free? Use together?
3. **Consulting** (3 questions) - What included? Topics outside? Why pricing?
4. **Research** (2 questions) - Where publish? Research areas?

**UX Principles:**
- Direct, helpful answers
- Factual, no marketing fluff
- Categories clear
- Accordions familiar UI

**Components:**
- FAQ accordions (existing UI)
- Category headers
- Questions (h4 or similar)
- Answers (p)

---

### 5.8 Contact Section

**Action:** Garder (déjà bon)

**Ajustements mineurs:**
- Placeholder: "I want to use your tools / get consulting help / request training / follow your research"

---

### 5.9 FinalCta Section

**Objectif:** Final push avec 3 options

**Layout:** 3 CTAs + trust badges

**3 CTAs:**
1. **Explore Projects** - MIT licensed, free forever
2. **Get Consulting Help** - €800-1,200/day, no minimum
3. **Follow Our Research** - Stay updated

**3 Trust Badges:**
- 10+ years expertise
- All MIT open source
- Mid-market accessible

**UX Principles:**
- Final choice before footer
- 3 paths clear
- Trust reinforcement

**Components:**
- 3 CTA cards (`.card-elevated`)
- Trust badges (inline icons + text)

---

## 6. User Flows

### 6.1 Primary Flow: Understand Positioning

1. **Land on Hero** → See "Applied AI Research"
2. **Read subtitle** → "We explore architectures, build tools, share"
3. **See trust badges** → "MCP Gateway • CasysDB" + "10+ years"
4. **Scan 3 CTAs** → Explore / Consult / Follow
5. **Choose path** → Click relevant CTA

**Success:** User understands multi-domain research lab in <10 seconds

---

### 6.2 Secondary Flow: Explore Projects

1. **Click "Explore Projects"** from Hero or WhatWeDo
2. **Scroll to Projects section**
3. **See Active Projects** → MCP Gateway, CasysDB (large cards)
4. **Read Problem/Solution** for relevant project
5. **See Stats** → Understand impact
6. **Click GitHub/Docs** → Explore further

**Success:** User finds relevant project and clicks through to GitHub/Docs

---

### 6.3 Tertiary Flow: Consulting Inquiry

1. **See "Consulting"** CTA in Hero or WhatWeDo
2. **Scroll to WorkWithUs** section
3. **Read Consulting option** → Services, pricing, approach
4. **See typical engagements** → Understand pricing range
5. **Click "Book a Call"** → Go to Contact form

**Success:** User understands consulting offering and contacts

---

### 6.4 Quaternary Flow: Follow Research

1. **See "Follow Research"** CTA in Hero or WhatWeDo
2. **Scroll to WorkWithUs** section
3. **Read Research option** → LinkedIn, Blog, GitHub, Talks
4. **Choose platform** → Click relevant link
5. **Follow/Subscribe** on chosen platform

**Success:** User follows on at least one channel

---

## 7. Interaction Patterns

### 7.1 Navigation

**Top Navigation:**
- Logo (link to home)
- Links: Documentation, Projects, Consulting, Research
- GitHub icon link
- Theme toggle (dark/light)

**Mobile Navigation:**
- Hamburger menu
- Same links as desktop
- Drawer or dropdown

---

### 7.2 CTAs Hierarchy

**Primary CTAs:**
- "Explore Projects" (main action)
- Large, prominent buttons
- `.btn-primary` style

**Secondary CTAs:**
- "Consulting", "Follow Research"
- Medium size buttons
- `.btn-secondary` or `.btn-outline` style

**Tertiary CTAs:**
- Section-specific CTAs (e.g., "Book a Call", "See Research Areas")
- Smaller, contextual
- `.btn-text` or `.btn-outline` style

---

### 7.3 Hover States

**Cards (MD3 Full Expressive 2026 BLACK Pattern):**
- `.card-elevated` → `translateY(-4px) scale(1.01)` (consistent lift + subtle scale)
- Background: `rgba(0, 0, 0, 0.6)` → `rgba(0, 0, 0, 0.7)` (darker)
- Border color: `rgba(250, 194, 255, 0.2)` → `rgba(250, 194, 255, 0.4)` (intensifies to violet)
- Glassmorphism: `blur(16px)` → `blur(20px)` (enhanced depth)
- Shadow: `0 8px 32px rgba(250, 194, 255, 0.15)` (violet glow)
- Transition: `0.3s cubic-bezier(0.4, 0, 0.2, 1)` (smooth, Material Design easing)

**Buttons:**
- Primary → Background darkens
- Secondary → Border thickens
- Text → Underline appears

**Links:**
- Text links → Underline
- Icon links → Color shift to `var(--casys-gradient-start)` (violet)

---

### 7.4 Loading States

**Page Load:**
- Skeleton screens for cards (optional)
- Fade-in animation for sections (stagger)

**CTA Clicks:**
- Button disabled state
- Loading spinner (if async)

---

## 8. Responsive Behavior

### 8.1 Desktop (>1024px)

**Layout:**
- Hero: Full width, centered content
- WhatWeDo: 3 columns
- Projects: 2 large cards side-by-side (Active), 2 small cards side-by-side (Archived)
- WhyCasys: 3 columns (2-3-2 pattern)
- WorkWithUs: 2x2 grid
- SocialProof: 4 columns
- FAQ: 2 columns accordions
- FinalCta: 3 columns

---

### 8.2 Tablet (768px - 1024px)

**Layout:**
- Hero: Full width, slightly reduced content width
- WhatWeDo: 2 columns (third wraps)
- Projects: Stack (Active cards full width, Archived 2 columns)
- WhyCasys: 2 columns
- WorkWithUs: 2x2 grid (might stack to 1x4 on smaller tablets)
- SocialProof: 2 columns
- FAQ: 1 column accordions
- FinalCta: 3 columns (smaller)

---

### 8.3 Mobile (<768px)

**Layout:**
- Hero: Stack, full width
- WhatWeDo: Stack (1 column)
- Projects: Stack (all cards full width)
- WhyCasys: Stack (1 column)
- WorkWithUs: Stack (1 column)
- SocialProof: Stack (1 column)
- FAQ: Stack (1 column accordions)
- FinalCta: Stack (1 column)

**Typography:**
- H1: Reduce size (3rem → 2rem)
- H2: Reduce size (2rem → 1.5rem)
- Body: Maintain readability (1rem)

**CTAs:**
- Full width buttons on mobile
- Larger touch targets (48px min)

---

## 9. Accessibility

### 9.1 WCAG Compliance

**Level:** AA (minimum)

**Key Requirements:**
- Color contrast: 4.5:1 for text, 3:1 for UI components
- Keyboard navigation: All interactive elements accessible
- Screen reader: Semantic HTML, ARIA labels where needed
- Focus indicators: Visible on all interactive elements

**MD3 Full Expressive 2026 BLACK Pattern - Contrast Ratios:**
- **Primary Text on Pure Black**: `var(--casys-text-primary)` on `#000000` → High contrast (>7:1, exceeds WCAG AAA)
- **Secondary Text on Pure Black**: `var(--casys-text-secondary)` on `#000000` → Good contrast (>4.5:1, meets WCAG AA)
- **Violet Border on Black**: `rgba(250, 194, 255, 0.2)` → Decorative (not critical for accessibility)
- **Focus Indicators**: 2px solid `var(--casys-gradient-start)` with high contrast on dark backgrounds

**Why Pure Black Works for Accessibility:**
- Maximum contrast ratios for all text colors
- Clear visual hierarchy with minimal effort
- Reduces eye strain in dark mode contexts
- Violet accents provide visual interest without compromising readability

---

### 9.2 Semantic HTML

**Structure:**
- `<header>` for top navigation
- `<main>` for content
- `<section>` for each landing section
- `<article>` for project cards
- `<footer>` for footer
- `<h1>` to `<h6>` hierarchy maintained

---

### 9.3 ARIA

**Usage:**
- `aria-label` for icon-only buttons (e.g., GitHub link, theme toggle)
- `aria-expanded` for accordions
- `aria-current` for navigation active state
- `role="navigation"` for nav elements

---

### 9.4 Keyboard Navigation

**Focus Order:**
1. Skip to content link
2. Top navigation
3. Hero CTAs
4. Section headings and content
5. Footer links

**Focus Indicators:**
- Visible outline (2px solid primary color)
- High contrast

---

## 10. Performance

### 10.1 Optimization Goals

**Targets:**
- First Contentful Paint (FCP): <1.5s
- Largest Contentful Paint (LCP): <2.5s
- Time to Interactive (TTI): <3.5s
- Cumulative Layout Shift (CLS): <0.1

---

### 10.2 Techniques

**Images:**
- WebP format with fallbacks
- Lazy loading for below-the-fold images
- Responsive images (srcset)

**Fonts:**
- Preload critical fonts
- Font-display: swap
- Subset fonts (only characters needed)

**CSS:**
- Critical CSS inline
- Non-critical CSS deferred
- Minified and compressed

**JS:**
- Minimal JS (Astro static generation)
- Code splitting
- Defer non-critical JS

**Assets:**
- CDN for static assets
- Compression (gzip/brotli)
- Cache headers

---

## 11. SEO

### 11.1 Meta Tags

**Title:** "Casys - Applied AI Research | Open Source Tools & Consulting"

**Description:** "Research lab exploring AI architectures across multiple domains. We build open-source tools (MCP Gateway, CasysDB), publish research, and help teams when needed. 10+ years expertise."

**Keywords:** Applied AI Research, Knowledge Management, Agentic Systems, Graph Databases, Open Source AI, MCP Gateway, CasysDB, AI Consulting

---

### 11.2 Structured Data

**Organization:**
```json
{
  "@context": "https://schema.org",
  "@type": "ResearchOrganization",
  "name": "Casys AI",
  "url": "https://casys.ai",
  "description": "Applied AI Research lab exploring multi-domain AI architectures",
  "foundingDate": "2013",
  "areaServed": "Worldwide"
}
```

**Products:**
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Casys MCP Gateway",
  "description": "Context intelligence for AI agents",
  "license": "https://opensource.org/licenses/MIT",
  "url": "https://github.com/casys-ai/mcp-gateway"
}
```

(Similar for CasysDB)

---

### 11.3 Open Graph

**og:title:** "Casys - Applied AI Research"
**og:description:** "Research lab exploring AI architectures. Open source tools, research publications, consulting."
**og:image:** [Screenshot or logo]
**og:url:** "https://casys.ai"
**og:type:** "website"

---

## 12. Analytics & Tracking

### 12.1 Events to Track

**Engagement:**
- CTA clicks (Explore Projects, Consulting, Follow Research)
- Section scrolls (Hero, WhatWeDo, Projects, etc.)
- External links (GitHub, LinkedIn, etc.)

**Conversions:**
- Contact form submissions
- GitHub repo visits
- Blog visits

**User Behavior:**
- Time on page
- Scroll depth
- Bounce rate

---

### 12.2 Goals

**Primary:**
- GitHub clicks (measure interest in projects)
- Contact form submissions (measure consulting interest)

**Secondary:**
- LinkedIn follows
- Blog visits
- Documentation visits

---

## 13. Content Strategy

### 13.1 Tone & Voice

**Applied AI Research Vibe:**
- Direct, factual, no bullshit
- Curious, exploratory (not locked into one buzzword)
- Humble about expertise (facts, not bragging)
- Practical (we ship production systems)
- Open (share research, MIT licensed)

**Examples:**
- ✅ "We explore AI architectures. Some projects become tools. Some inform future research. We share what works."
- ❌ "We're revolutionizing multi-domain AI research with groundbreaking cross-pollination methodologies"

---

### 13.2 Language

**Primary:** English (EN)
**Secondary:** French (FR)

**Implementation:**
- Language switcher in navigation
- All content translated
- URL structure: `/` (EN default), `/fr/` (FR)

---

### 13.3 Content Updates

**Frequency:**
- Projects section: Update when new project launches or status changes
- SocialProof: Update stats periodically (e.g., new talks, workshops)
- FAQ: Add questions as they arise
- Blog posts: Link from Research section

**Maintenance:**
- Review quarterly for accuracy
- Update screenshots/demos as projects evolve
- Add testimonials when available

---

## 14. Next Steps

### 14.1 Implementation Plan

**Phase 1 (P0 - Critical):**
1. ✅ Story document updated
2. ✅ Refonte landing page document updated
3. ✅ UX design spec updated
4. Implement Hero section
5. Implement WhatWeDo section
6. Implement Projects section (NEW)
7. Implement WhyCasys section
8. Implement WorkWithUs section

**Phase 2 (P1 - Important):**
9. Implement SocialProof section
10. Implement FAQ section
11. Update Contact section (minor)
12. Implement FinalCta section

**Phase 3 (P2 - Polish):**
13. SEO optimization
14. Performance optimization
15. Analytics setup
16. Accessibility audit
17. Cross-browser testing

---

### 14.2 Design Deliverables

**Required:**
- [ ] Wireframes (all sections)
- [ ] High-fidelity mockups (desktop + mobile)
- [ ] Component library (cards, buttons, etc.)
- [ ] Interaction specs (hover, click states)
- [ ] Responsive breakpoints documented

**Optional:**
- [ ] Figma prototype (interactive)
- [ ] Animation specs (if complex animations)
- [ ] Iconography set (Material Icons + custom if needed)

---

### 14.3 Development Handoff

**Documentation:**
- This UX spec document
- Refonte landing page document (content)
- Story document (positioning)
- Component specifications

**Assets:**
- Design files (Figma, Sketch, or similar)
- Logo files (SVG, PNG)
- Screenshots/demos for Projects section
- Any custom icons

**Code Guidelines:**
- Use existing design system (M3 Expressive + CASYS tokens)
- Maintain utility classes (don't create new ones)
- Follow Astro component patterns
- Ensure responsive behavior
- Accessibility compliance (WCAG AA)

---

## 15. Success Metrics

### 15.1 Launch Metrics (First Month)

**Traffic:**
- 1,000+ unique visitors
- <60% bounce rate
- >2 min average time on page

**Engagement:**
- 100+ GitHub clicks
- 50+ contact form submissions
- 25+ LinkedIn follows

**Technical:**
- LCP <2.5s
- CLS <0.1
- Lighthouse score >90

---

### 15.2 Long-Term Metrics (3-6 Months)

**Growth:**
- 5,000+ unique visitors/month
- 50% MoM traffic growth
- 10+ consulting inquiries/month

**Community:**
- 500+ GitHub stars (combined repos)
- 1,000+ LinkedIn followers
- 100+ blog readers/post

**Quality:**
- User feedback (qualitative)
- Positioning clarity (survey)
- Conversion rate optimization

---

## 16. Risks & Mitigations

### 16.1 Positioning Confusion

**Risk:** Multi-domain might confuse visitors ("What do you actually do?")

**Mitigation:**
- Hero very clear: "Applied AI Research"
- WhatWeDo section explains 3 pillars immediately
- Projects section shows concrete examples
- FAQ addresses "What is Casys?"

---

### 16.2 Too Much Content

**Risk:** Too many sections, overwhelming

**Mitigation:**
- Clear visual hierarchy
- Each section focused on one thing
- Skip links for power users
- Responsive design ensures mobile not overwhelming

---

### 16.3 Perception of "Jack of All Trades"

**Risk:** Multi-domain could be seen as not specialized

**Mitigation:**
- Emphasize 10+ years continuity (not just jumping on trends)
- Show evolution timeline (KM → Graphs → Agents)
- Concrete proof (ship production systems)
- Open source projects demonstrate expertise

---

## 17. Future Enhancements

### 17.1 Short-Term (1-3 Months)

- Blog/Articles section (link from Research)
- Case studies (consulting projects)
- Testimonials (when projects reach production users)
- Screenshots/demos for Projects section

---

### 17.2 Medium-Term (3-6 Months)

- About page (team, story, philosophy)
- Individual project pages (detailed docs)
- Publications catalog (indexed articles, talks)
- Video demos

---

### 17.3 Long-Term (6-12 Months)

- Community section (contributors, discussions)
- Newsletter (research updates)
- Events calendar (workshops, talks)
- Interactive demos (try projects in browser)

---

_UX Design Specification crafted using the BMAD UX Design Workflow_

**Document updated:** 2025-11-15
**Version:** 3.1 - Applied AI Research (Multi-Project) + MD3 Full Expressive 2026 BLACK
**Replaces:** Version 3.0 - Applied AI Research (without unified dark mode pattern)
**Previous:** Version 2.0 - Context Management for Agentic Systems (Single-Product Focus)

**Design System Update (v3.1):**
- Migration from M3 Expressive to MD3 Full Expressive 2026 BLACK
- Unified dark mode pattern across all 15 landing page sections
- Pure black backgrounds (`#000000`) with violet glassmorphic accents
- Centralized styling in `LandingLayout.astro` to prevent Astro CSS scoping issues
- Consistent hover states: `translateY(-4px) scale(1.01)` with enhanced glassmorphism

For questions or clarifications: see [story-2025-11-11.md](./story-2025-11-11.md) and [REFONTE-LANDING-PAGE.md](./REFONTE-LANDING-PAGE.md)
