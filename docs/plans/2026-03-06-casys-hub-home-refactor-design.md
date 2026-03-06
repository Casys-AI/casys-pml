# Casys Hub Home Refactor Design

**Date:** 2026-03-06
**Scope:** `lib/casys-hub-vitrine`

## Problem

The current home page leads with too many identities at once:

- research lab
- open-source vendor
- consulting firm
- PML product surface

That makes the site credible but diffuse. It also asks visitors to understand internal product names too early.

## Design Goal

Rebuild the home page around a cleaner funnel:

1. promise
2. proof
3. stack credibility
4. technical depth
5. broader context
6. conversion

## Headline Decision

Primary headline candidate:

`AI tool integrations you can actually trust.`

Supporting line:

`Observable MCP infrastructure — trace every call, validate before execution, and deploy on your terms.`

This keeps the main promise legible to visitors who do not already think in MCP vocabulary, while still signaling the relevant protocol context immediately below the headline.

## Content Hierarchy

### 1. Hero = capability

The headline should describe the outcome, not a product name:
- trustworthy AI tool integrations
- observable execution
- deployable workflows

`MCP` belongs in the supporting line, not in the main headline.

### 2. Featured proof = MCP ERPNext

`MCP ERPNext` is presented as the clearest concrete example:

- interactive business workflow
- real system integration
- local video proof

It is a featured case study, not the identity of Casys.

### 3. Open-source stack = published proof

`@casys/mcp-server`, `@casys/mcp-std`, `@casys/mcp-bridge`, and `@casys/mcp-erpnext` stay visible as the published foundation.

This section proves the work is real and reusable.

### 4. PML = under the hood

`PML` is repositioned as the learning and observability layer:

- traces
- routing
- relevance learning
- workflow memory

It should not be sold as the main public product on the home page.

### 5. Broader context = use cases, blog, trust, FAQ

The home page should keep the surrounding credibility context:

- use cases preview
- blog preview
- why Casys trust layer
- FAQ

These are not replaced. They are pushed after promise, proof, stack, and depth so they support the story instead of competing with it.

### 6. Conversion

Consulting moves lower in the funnel:

- after proof
- after stack credibility
- after technical explanation

## Architecture Decision

Keep `casys.ai` as the marketing source of truth.

Do not create `erpnext.casys.ai` for now.

Add a lightweight page on the root domain:

- `/mcp-erpnext`
- localized variants for `fr`, `zh`, `zh-TW`

## Home Page Order

Exact target order:

1. Hero
2. Featured proof: MCP ERPNext
3. Open-source stack
4. Under the hood: PML / traces / learned relevance
5. Use cases preview
6. Blog preview
7. Why Casys
8. FAQ
9. Final CTA
10. Contact

## Mapping Existing Sections

- `Hero.astro`
  keep component, rewrite copy
- `Projects.astro`
  keep component shell, replace featured `PML` product framing with stack framing
- `WhatWeDo.astro`
  keep 3-card layout, repurpose it as under-the-hood technical depth
- `UseCasesPreview.astro`
  keep in place, move lower in the page
- `Blog.astro`
  keep in place, move after use cases
- `WhyCasys.astro`
  keep in place, shift role to trust layer instead of early positioning
- `FAQ.astro`
  keep in place, rewrite questions to match the new hierarchy
- `FinalCta.astro`
  keep component, remove `Try PML` as the primary public CTA

## Asset Dependency

The local ERPNext video dependency has been verified in the repo:

- `lib/casys-hub-vitrine/public/videos/Connecting Your LLM to ERPNext in 30 Seconds! 🚀.mp4`

Fallback if the video is later removed:

- use screenshots or a short GIF in the same featured proof section
- keep the section itself, because the architecture decision does not depend on a single media format

## SEO Note

This refactor does not resolve the separate technical SEO workstream.

Those fixes still need dedicated follow-up work:

- canonical coverage
- `og:url`
- sitemap coverage for the desired public surfaces

## Implementation Scope

- update home section order
- add featured demo section with local video
- refactor copy in all four locales
- reframe projects as stack
- reframe `whatWeDo` as under-the-hood technical depth
- remove `Try PML` as a primary CTA
- add root-domain `MCP ERPNext` page
