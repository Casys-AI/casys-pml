# Casys Hub Home Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reposition the Casys hub home page around capability, proof, stack credibility, and under-the-hood depth instead of product-name-first messaging.

**Architecture:** Keep the existing Astro UI structure, but change the home page hierarchy and translations. Add one new featured demo section plus a lightweight `/mcp-erpnext` page on the main domain. Reuse existing layouts and card patterns where possible.

**Tech Stack:** Astro 5, TypeScript, localized content files in `src/i18n`, existing landing-v2 Astro components

---

### Task 1: Add the new home-page proof section

**Files:**
- Create: `lib/casys-hub-vitrine/src/features/landing-v2/FeaturedDemo.astro`
- Modify: `lib/casys-hub-vitrine/src/pages/index.astro`
- Modify: `lib/casys-hub-vitrine/src/pages/fr/index.astro`
- Modify: `lib/casys-hub-vitrine/src/pages/zh/index.astro`
- Modify: `lib/casys-hub-vitrine/src/pages/zh-TW/index.astro`

**Step 1: Write the component**

Build a featured demo section that:

- reads localized copy from i18n
- embeds the local ERPNext video
- links to `/mcp-erpnext`
- presents ERPNext as proof, not identity

**Step 2: Place the section after the hero**

Update all localized home pages to use:

- `Hero`
- `FeaturedDemo`
- `Projects`
- `WhatWeDo`
- `UseCasesPreview`
- `Blog`
- `WhyCasys`
- `FAQ`
- `FinalCta`
- `Contact`

This order is not optional. It is the narrative funnel for the refactor.

**Step 3: Verify**

Run the Astro build and make sure the new section renders across locales.

### Task 2: Refactor home-page messaging across locales

**Files:**
- Modify: `lib/casys-hub-vitrine/src/i18n/en.ts`
- Modify: `lib/casys-hub-vitrine/src/i18n/fr.ts`
- Modify: `lib/casys-hub-vitrine/src/i18n/zh.ts`
- Modify: `lib/casys-hub-vitrine/src/i18n/zh-TW.ts`

**Step 1: Update hero copy**

Shift the hero from product-name-first to capability-first language.

**Step 2: Add featured demo copy**

Add localized strings for the ERPNext proof section.

Use this headline direction:

- headline: `AI tool integrations you can actually trust.`
- support line: `Observable MCP infrastructure — trace every call, validate before execution, and deploy on your terms.`

**Step 3: Reframe projects and what-we-do**

Turn:

- `projects` into the open-source stack section
- `whatWeDo` into the under-the-hood / learning-layer section

Mapping for existing content:

- keep `Projects.astro` shell, replace featured PML product framing with stack framing
- keep `WhatWeDo.astro` shell, replace research / open source / consulting copy with learning layer / guardrails / applied workflow architecture

**Step 4: Rework FAQ and CTA**

Make `PML` a technical depth element, not the main public CTA.

### Task 3: Make navigation and link behavior match the new story

**Files:**
- Modify: `lib/casys-hub-vitrine/src/components/Header.astro`
- Modify: `lib/casys-hub-vitrine/src/features/landing-v2/Hero.astro`
- Modify: `lib/casys-hub-vitrine/src/features/landing-v2/Projects.astro`
- Modify: `lib/casys-hub-vitrine/src/features/landing-v2/WhyCasys.astro`

**Step 1: Add root-domain MCP ERPNext link**

Surface the new proof page in the header project menu.

**Step 2: Fix internal-vs-external linking**

Ensure internal links do not open new tabs and external links still do.

### Task 4: Add the root-domain MCP ERPNext page

**Files:**
- Create: `lib/casys-hub-vitrine/src/features/landing-v2/McpErpnextPage.astro`
- Create: `lib/casys-hub-vitrine/src/pages/mcp-erpnext.astro`
- Create: `lib/casys-hub-vitrine/src/pages/fr/mcp-erpnext.astro`
- Create: `lib/casys-hub-vitrine/src/pages/zh/mcp-erpnext.astro`
- Create: `lib/casys-hub-vitrine/src/pages/zh-TW/mcp-erpnext.astro`

**Step 1: Build a lightweight proof page**

Include:

- concise hero
- local video
- proof points
- explanation of why ERPNext is an example workflow
- links back to the stack and contact

Dependency note:

- local video asset is already present at `lib/casys-hub-vitrine/public/videos/Connecting Your LLM to ERPNext in 30 Seconds! 🚀.mp4`
- if this asset disappears, use screenshots or a GIF instead of removing the proof page

**Step 2: Verify routing**

Make sure each localized route resolves and uses the shared layout.

### Task 5: Verify and review

**Files:**
- Verify build output from `lib/casys-hub-vitrine`

**Step 1: Run build**

Run:

```bash
pnpm build
```

Expected:

- Astro build passes
- new pages are emitted
- no missing translation keys or broken imports

**Step 2: Review changed files**

Check:

- message hierarchy is correct
- ERPNext is proof, not identity
- PML is under the hood
- consulting no longer leads the site

Out of scope for this plan:

- canonical fix
- `og:url` coverage
- broader technical SEO cleanup

Plan complete and saved to `docs/plans/2026-03-06-casys-hub-home-refactor.md`.
