---
title: 'SEO Optimization for casys.ai — Titles, Schema.org, Descriptions'
slug: 'seo-optimization-casys-ai'
created: '2026-02-27'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Astro 5.11', 'Vercel', 'Material Design 3', 'TypeScript', 'Preact (islands)']
files_to_modify:
  - 'lib/casys-hub-vitrine/src/layouts/LandingLayout.astro'
  - 'lib/casys-hub-vitrine/src/layouts/BlogLayout.astro'
  - 'lib/casys-hub-vitrine/src/layouts/PmlLayout.astro'
  - 'lib/casys-hub-vitrine/src/components/SubsiteLayout.astro'
  - 'lib/casys-hub-vitrine/src/pages/index.astro'
  - 'lib/casys-hub-vitrine/src/pages/about.astro'
  - 'lib/casys-hub-vitrine/src/pages/use-cases.astro'
  - 'lib/casys-hub-vitrine/src/pages/use-cases/chat-first-workflows.astro'
  - 'lib/casys-hub-vitrine/src/pages/use-cases/plannable-mcp-workflows.astro'
  - 'lib/casys-hub-vitrine/src/pages/use-cases/navigable-knowledge-graphs.astro'
  - 'lib/casys-hub-vitrine/src/pages/fr/index.astro'
  - 'lib/casys-hub-vitrine/src/pages/fr/about.astro'
  - 'lib/casys-hub-vitrine/src/pages/fr/use-cases.astro'
  - 'lib/casys-hub-vitrine/src/pages/zh/index.astro'
  - 'lib/casys-hub-vitrine/src/pages/zh/about.astro'
  - 'lib/casys-hub-vitrine/src/pages/zh/use-cases.astro'
  - 'lib/casys-hub-vitrine/src/pages/mcp-server.astro'
  - 'lib/casys-hub-vitrine/src/pages/mcp-bridge.astro'
  - 'lib/casys-hub-vitrine/src/pages/mcp-std.astro'
  - 'lib/casys-hub-vitrine/src/pages/pml/index.astro'
  - 'lib/casys-hub-vitrine/src/features/mcp-server/McpServerLayout.astro'
  - 'lib/casys-hub-vitrine/src/features/mcp-bridge/McpBridgeLayout.astro'
  - 'lib/casys-hub-vitrine/src/features/mcp-std/McpStdLayout.astro'
  - 'src/web/routes/index.tsx'
  - 'src/web/content/landing.ts'
  - '/etc/caddy/Caddyfile'
code_patterns:
  - 'LandingLayout ignores title prop — uses hardcoded metaTitles dict (L86)'
  - 'BlogLayout accepts title/description props correctly'
  - 'SubsiteLayout accepts title/metaDescription props correctly'
  - 'PmlLayout has hardcoded metaDescriptions but accepts title prop'
  - 'JSON-LD pattern: <script type="application/ld+json" set:html={JSON.stringify(obj)} />'
  - 'i18n: en=no prefix, fr=/fr/, zh=/zh/'
test_patterns: ['DataForSEO on-page crawl', 'Google Rich Results Test', 'curl -I for 301']
---

# Tech-Spec: SEO Optimization for casys.ai — Titles, Schema.org, Descriptions

**Created:** 2026-02-27

## Overview

### Problem Statement

casys.ai has strong products but zero SEO visibility on high-value keywords. DataForSEO audit (2026-02-27):

- **22/31 duplicate titles** — Root cause: `LandingLayout.astro:86` ignores `title` prop, uses hardcoded dict
- **22/31 duplicate descriptions** — Same root cause
- **No Article schema on blog** — BlogLayout has zero JSON-LD
- **No SoftwareApplication schema** — SubsiteLayout and PmlLayout have zero JSON-LD
- **"MCP bridge" absent top 96** despite real product
- **Zero SERP ranking** on MCP server (49.5K/mo), MCP protocol (8.1K/mo), GraphRAG (4.4K/mo)

### Solution

1. Fix LandingLayout title/description bug (prop ignored → use prop with dict fallback)
2. Add JSON-LD Article schema to BlogLayout
3. Add JSON-LD SoftwareApplication schema to SubsiteLayout + PmlLayout
4. Add 301 redirects for pml.casys.ai/blog/* in middleware

### Scope

**In Scope:** Fix titles, descriptions, add JSON-LD schemas, add 301 redirect. Covers BOTH Astro (Vercel: casys.ai) AND Fresh (your server: pml.casys.ai).
**Out of Scope:** Content creation, backlinks, performance, image attributes, blog search, engine.casys.ai (intentionally not public-facing)

## Context for Development

### Root Cause Analysis

`LandingLayout.astro` declares `title` in Props interface (L8-10) but `<title>` tag at L86 renders `{metaTitle}` from a hardcoded locale dict instead of `{title}`. Pages like `about.astro` pass unique titles that get silently discarded. Same pattern for descriptions (L40 hardcoded, no prop).

### Hosting Architecture (Dual-Site)

| Domain | Stack | Server | Purpose |
|--------|-------|--------|---------|
| `casys.ai` | Astro 5.11 | Vercel | Marketing site, blog, product pages |
| `mcp-server.casys.ai` | Astro (rewrite) | Vercel | Product page via middleware rewrite → `/mcp-server` |
| `mcp-bridge.casys.ai` | Astro (rewrite) | Vercel | Product page via middleware rewrite → `/mcp-bridge` |
| `mcp-std.casys.ai` | Astro (rewrite) | Vercel | Product page via middleware rewrite → `/mcp-std` |
| `engine.casys.ai` | Astro (rewrite) | Vercel | Product page (intentionally not SEO-visible) |
| `pml.casys.ai` | **Fresh (Deno)** | **Your server** (Caddy+CF) | PML app + landing, NOT on Vercel |

**Key insight:** `pml.casys.ai` is a completely separate codebase (Fresh islands in `src/web/`) served from your own server behind Caddy. The Vercel middleware `SUBDOMAIN_ROUTES['pml.casys.ai']` is dead code in production — DNS never reaches Vercel. The Astro PML pages at `casys.ai/pml` and Fresh PML at `pml.casys.ai` are two different sites with different HTML.

### Layout Architecture (Astro — Vercel)

| Layout | Location | Title | Description | JSON-LD |
|--------|----------|-------|-------------|---------|
| LandingLayout | `src/layouts/` | BUG: prop ignored | Hardcoded, no prop | Org+WebSite+FAQ |
| BlogLayout | `src/layouts/` | Prop ✅ | Prop+fallback ✅ | **NONE** |
| SubsiteLayout | `src/components/` | Prop ✅ | Prop ✅ | **NONE** |
| PmlLayout | `src/layouts/` | Prop ✅ | Hardcoded | **NONE** |

### Files to Reference

| File | Purpose | Action |
| ---- | ------- | ------ |
| `src/layouts/LandingLayout.astro` | Main layout | Fix title/desc bug |
| `src/layouts/BlogLayout.astro` | Blog layout | Add Article JSON-LD |
| `src/layouts/PmlLayout.astro` | PML layout | Add SoftwareApp JSON-LD, add desc prop |
| `src/components/SubsiteLayout.astro` | MCP products layout | Add SoftwareApp JSON-LD |
| `src/pages/*.astro` | Landing pages | Pass unique descriptions |
| `src/pages/blog/[...slug].astro` | Blog EN | Already passes title/desc |
| `middleware.ts` | Subdomain routing | Add blog 301 redirect |

### Technical Decisions

- Title precedence: `Astro.props.title || metaTitles[locale]`
- Description precedence: `Astro.props.description || metaDescriptions[locale]`
- Article schema from frontmatter (title, description, date, author, tags)
- SoftwareApplication schema: static per product, passed as prop or inline
- 301 redirect only for pml.casys.ai/blog/* (the only subdomain that had a blog)

## Implementation Plan

### Tasks

- [x] **Task 1: Fix LandingLayout title/description props**
  - File: `lib/casys-hub-vitrine/src/layouts/LandingLayout.astro`
  - Action:
    1. Update Props interface: add optional `description` prop
       ```typescript
       export interface Props {
         title: string;
         description?: string;
       }
       const { title, description } = Astro.props;
       ```
    2. Change L86 from `<title>{metaTitle}</title>` to `<title>{title || metaTitle}</title>`
    3. Change L40 meta description: use `description || metaDescription`
    4. Update OG/Twitter title and description tags to use the same resolved values
  - Notes: This single change fixes 22 duplicate titles. All pages already pass unique titles — they just get ignored today.

- [x] **Task 2: Ensure all landing pages pass unique titles and descriptions**
  - Files: All pages using `LandingLayout`
  - Action: Verify or update each page's `<LandingLayout>` call with keyword-optimized title and description:

  **EN pages:**
  | Page | File | Title | Description |
  |------|------|-------|-------------|
  | Homepage | `src/pages/index.astro` | `MCP Server Framework & GraphRAG Engine | Casys AI` | `Open-source MCP server framework, MCP bridge for messaging, and GraphRAG engine. Build production AI workflows with context engineering.` |
  | About | `src/pages/about.astro` | `About Casys AI — Applied AI Research Lab` | `Applied AI research lab specializing in MCP infrastructure, knowledge graphs, and agentic systems. Founded by Erwan Lee Pesle.` |
  | Use Cases | `src/pages/use-cases.astro` | `AI Use Cases — MCP Workflows & Knowledge Graphs | Casys` | `Real-world AI implementations: chat-first workflows, plannable MCP pipelines, and navigable knowledge graphs.` |
  | Chat-first | `src/pages/use-cases/chat-first-workflows.astro` | `Chat-First AI Workflows — MCP Apps on Messaging | Casys` | `Build AI workflows that run inside Telegram, LINE, and messaging platforms using MCP Apps and the Casys MCP Bridge.` |
  | Plannable MCP | `src/pages/use-cases/plannable-mcp-workflows.astro` | `Plannable MCP Workflows — Observable AI Pipelines | Casys` | `Design, execute, and observe multi-step MCP tool pipelines with full traceability and human-in-the-loop controls.` |
  | Knowledge Graphs | `src/pages/use-cases/navigable-knowledge-graphs.astro` | `Navigable Knowledge Graphs — GraphRAG for AI Agents | Casys` | `Turn tool usage patterns into navigable knowledge graphs. GraphRAG-powered discovery for MCP server capabilities.` |

  **FR pages:** Same structure, localized titles. Examples:
  | Page | Title |
  |------|-------|
  | Homepage FR | `Framework MCP & Moteur GraphRAG | Casys AI` |
  | About FR | `À propos de Casys AI — Lab de Recherche IA Appliquée` |
  | Use Cases FR | `Cas d'usage IA — Workflows MCP & Knowledge Graphs | Casys` |

  **ZH pages:** Same structure, localized. Examples:
  | Page | Title |
  |------|-------|
  | Homepage ZH | `MCP 服务器框架与 GraphRAG 引擎 | Casys AI` |
  | About ZH | `关于 Casys AI — 应用 AI 研究实验室` |

  - Notes: Use case detail pages currently use `uc.title.en` — these need keyword enrichment.

- [x] **Task 3: Add JSON-LD Article schema to BlogLayout**
  - File: `lib/casys-hub-vitrine/src/layouts/BlogLayout.astro`
  - Action:
    1. Add new props for Article schema data:
       ```typescript
       export interface Props {
         title: string;
         locale?: 'en' | 'fr' | 'zh';
         description?: string;
         slug?: string;
         ogTitle?: string;
         ogDescription?: string;
         // New for Article schema:
         datePublished?: string;
         dateModified?: string;
         author?: string;
         tags?: string[];
         category?: string;
       }
       ```
    2. Add JSON-LD Article script in `<head>`, after the existing meta tags (before `</head>`):
       ```astro
       {slug && (
         <script type="application/ld+json" set:html={JSON.stringify({
           "@context": "https://schema.org",
           "@type": "Article",
           "headline": title,
           "description": description || t.blogSubtitle,
           "image": ogImage,
           "datePublished": datePublished,
           ...(dateModified && { "dateModified": dateModified }),
           "author": {
             "@type": "Organization",
             "name": "Casys AI",
             "url": "https://casys.ai"
           },
           "publisher": {
             "@type": "Organization",
             "name": "Casys AI",
             "logo": {
               "@type": "ImageObject",
               "url": "https://casys.ai/icons/logo.svg"
             }
           },
           "mainEntityOfPage": {
             "@type": "WebPage",
             "@id": `https://casys.ai/blog/${slug}`
           },
           ...(tags?.length && { "keywords": tags.join(", ") }),
           ...(category && { "articleSection": category }),
           "inLanguage": locale
         })} />
       )}
       ```
    3. Only render Article schema when `slug` is present (article pages, not blog index)
  - Notes: `slug` already distinguishes article pages from blog index. Article schema enables rich snippets in Google.

- [x] **Task 4: Pass Article schema props from blog page routes**
  - Files:
    - `src/pages/blog/[...slug].astro`
    - `src/pages/fr/blog/[...slug].astro`
    - `src/pages/zh/blog/[...slug].astro`
  - Action: Update `<BlogLayout>` calls to pass the new props:
    ```astro
    <BlogLayout
      title={entry.data.title}
      locale={locale}
      description={entry.data.description}
      slug={entry.slug.replace(`${locale}/`, '')}
      datePublished={entry.data.date.toISOString()}
      dateModified={entry.data.updatedAt?.toISOString()}
      author={entry.data.author}
      tags={entry.data.tags}
      category={entry.data.category}
    >
    ```
  - Notes: `date` is required in blog schema, `updatedAt` is optional. All fields already exist in content collection schema (`content.config.ts`).

- [x] **Task 5: Add JSON-LD SoftwareApplication to SubsiteLayout**
  - File: `lib/casys-hub-vitrine/src/components/SubsiteLayout.astro`
  - Action:
    1. Add optional `jsonLd` prop:
       ```typescript
       export interface Props {
         title: string;
         metaDescription: string;
         ogImage?: string;
         jsonLd?: Record<string, unknown>;
       }
       ```
    2. Render JSON-LD if provided, in `<head>` after existing OG tags:
       ```astro
       {jsonLd && (
         <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
       )}
       ```
  - Notes: Generic approach — each product layout passes its own schema.

- [x] **Task 6: Pass SoftwareApplication JSON-LD from product layouts**
  - Files:
    - `src/features/mcp-server/McpServerLayout.astro`
    - `src/features/mcp-bridge/McpBridgeLayout.astro` (verify path)
    - `src/features/mcp-std/McpStdLayout.astro` (verify path)
  - Action: Each product layout passes JSON-LD to SubsiteLayout:
    ```astro
    <SubsiteLayout title={title} metaDescription={metaDescription} jsonLd={{
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "@casys/mcp-server",
      "description": metaDescription,
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Cross-platform",
      "url": "https://casys.ai/mcp-server",
      "author": {
        "@type": "Organization",
        "name": "Casys AI"
      },
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "license": "https://opensource.org/licenses/MIT"
    }}>
    ```
  - Product-specific fields:
    - **mcp-server**: name=`@casys/mcp-server`, description="Production-grade MCP server framework with composable middleware"
    - **mcp-bridge**: name=`@casys/mcp-bridge`, description="Bridge MCP Apps to messaging platforms (Telegram, LINE)"
    - **mcp-std**: name=`@casys/mcp-std`, description="508 standard MCP tools for AI agents"

- [x] **Task 7: Add JSON-LD SoftwareApplication to PmlLayout**
  - File: `lib/casys-hub-vitrine/src/layouts/PmlLayout.astro`
  - Action:
    1. Add optional `description` prop (currently hardcoded):
       ```typescript
       export interface Props {
         title: string;
         description?: string;
       }
       ```
    2. Use `description || metaDescriptions[locale]` for meta tags
    3. Add SoftwareApplication JSON-LD in `<head>`:
       ```astro
       <script type="application/ld+json" set:html={JSON.stringify({
         "@context": "https://schema.org",
         "@type": "SoftwareApplication",
         "name": "Casys PML",
         "alternateName": "Procedural Memory Layer",
         "description": "AI agent gateway with procedural memory, tool orchestration, and full observability. One gateway, any model.",
         "applicationCategory": "DeveloperApplication",
         "operatingSystem": "Cross-platform",
         "url": "https://pml.casys.ai",
         "author": {
           "@type": "Organization",
           "name": "Casys AI"
         },
         "offers": {
           "@type": "Offer",
           "price": "0",
           "priceCurrency": "USD"
         }
       })} />
       ```

- [x] **Task 8: Add HrefLang to SubsiteLayout and PmlLayout**
  - Files:
    - `lib/casys-hub-vitrine/src/components/SubsiteLayout.astro`
    - `lib/casys-hub-vitrine/src/layouts/PmlLayout.astro`
  - Action:
    1. Import `HrefLang` component in both layouts:
       ```astro
       import HrefLang from '../components/HrefLang.astro';
       ```
       (PmlLayout: `import HrefLang from '../components/HrefLang.astro';`)
    2. Add `<HrefLang />` in `<head>` section of both layouts
  - Notes: Currently LandingLayout includes HrefLang but SubsiteLayout and PmlLayout do NOT. This means 15 product pages (5 products × 3 locales) have no hreflang tags — Google doesn't know `/mcp-server` and `/fr/mcp-server` are the same content in different languages.

- [x] **Task 9: Fix PmlLayout canonical URL**
  - File: `lib/casys-hub-vitrine/src/layouts/PmlLayout.astro`
  - Action:
    1. Change L13-14 from hardcoded `pml.casys.ai`:
       ```typescript
       // BEFORE (L13-14):
       const siteUrl = 'https://pml.casys.ai';
       const canonicalUrl = new URL(pathname, siteUrl).toString();

       // AFTER:
       const siteUrl = import.meta.env.PUBLIC_SITE_URL as string | undefined;
       const canonicalUrl = siteUrl ? new URL(pathname, siteUrl).toString() : undefined;
       ```
  - Notes: **Dual-site architecture discovered**: `pml.casys.ai` = Fresh (Deno) on your server (Caddy+CF), `casys.ai/pml` = Astro on Vercel. These are two completely different codebases serving different HTML. PmlLayout.astro only generates pages for `casys.ai/pml` (Vercel). Current canonical `https://pml.casys.ai/pml/` has a double-path bug AND points to a different site. Fix: use `PUBLIC_SITE_URL` → canonical becomes `https://casys.ai/pml`. The SoftwareApplication JSON-LD (Task 7) can still reference `pml.casys.ai` as the product URL since that's where the actual app lives.

- [x] **Task 10: Optimize product page titles for keywords**
  - Files:
    - `src/pages/mcp-server.astro` + `src/pages/fr/mcp-server.astro` + `src/pages/zh/mcp-server.astro`
    - `src/pages/mcp-bridge.astro` + FR/ZH variants
    - `src/pages/mcp-std.astro` + FR/ZH variants
    - `src/pages/pml/index.astro` + FR/ZH variants
  - Action: Titles currently start with package name (`@casys/mcp-server`) — lead with keyword instead:

  | Product | Current title | Proposed title |
  |---------|--------------|----------------|
  | mcp-server EN | `@casys/mcp-server - Production-Grade MCP Server Framework` | `Production MCP Server Framework — @casys/mcp-server | Casys AI` |
  | mcp-server FR | `@casys/mcp-server - Framework MCP Production-Grade` | `Framework MCP Production — @casys/mcp-server | Casys AI` |
  | mcp-bridge EN | `@casys/mcp-bridge - MCP Apps to Messaging Platforms` | `MCP Apps Bridge for Telegram & LINE — @casys/mcp-bridge | Casys AI` |
  | mcp-bridge FR | `@casys/mcp-bridge - MCP Apps sur Plateformes Messagerie` | `Bridge MCP Apps vers Telegram & LINE — @casys/mcp-bridge | Casys AI` |
  | mcp-std EN | `@casys/mcp-std - 508 MCP Standard Tools` | `508 MCP Tools for AI Agents — @casys/mcp-std | Casys AI` |
  | pml EN | `Casys PML - Procedural Memory Layer for AI Agents` | `MCP Gateway & AI Agent Memory — Casys PML` |
  | pml FR | `Casys PML - Mémoire Procédurale pour Agents AI` | `Gateway MCP & Mémoire Agent IA — Casys PML` |

  - Notes: Keywords first, package name second, brand suffix last. Avoid exceeding 60 chars for Google display. Engine excluded intentionally (not meant to be publicly visible).

- [x] **Task 11: Add canonical + JSON-LD to Fresh PML landing (pml.casys.ai)**
  - Files:
    - `src/web/routes/index.tsx` (Fresh landing page `<Head>`)
    - `src/web/content/landing.ts` (meta content)
  - Action:
    1. Add `<link rel="canonical">` in `<Head>` section (currently missing):
       ```tsx
       <link rel="canonical" href="https://pml.casys.ai/" />
       ```
    2. Add JSON-LD SoftwareApplication schema after the twitter meta tags:
       ```tsx
       {/* Structured Data */}
       <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
         "@context": "https://schema.org",
         "@type": "SoftwareApplication",
         "name": "Casys PML",
         "alternateName": "Procedural Memory Layer",
         "description": meta.description,
         "applicationCategory": "DeveloperApplication",
         "operatingSystem": "Cross-platform",
         "url": "https://pml.casys.ai",
         "author": {
           "@type": "Organization",
           "name": "Casys AI",
           "url": "https://casys.ai"
         },
         "offers": {
           "@type": "Offer",
           "price": "0",
           "priceCurrency": "USD"
         },
         "license": "https://opensource.org/licenses/MIT"
       }) }} />
       ```
    3. Optionally update `meta.title` in `landing.ts` for keyword optimization:
       ```typescript
       title: "MCP Gateway & AI Agent Memory — Casys PML",
       ```
  - Notes: `pml.casys.ai` is a Fresh (Deno) site on your server, NOT Astro. Currently has zero structured data and no canonical. This is the production PML site (Caddy + Cloudflare).

- [x] **Task 12: Add 301 redirect for pml.casys.ai/blog/* in Caddyfile**
  - File: `/etc/caddy/Caddyfile`
  - Action: Add a redirect block BEFORE the dashboard catch-all:
    ```caddy
    # 301 redirect: blog moved to casys.ai/blog
    handle /blog* {
        redir https://casys.ai{uri} 301
    }
    ```
    Insert between the MCP Apps Bridge block (line 64) and the dashboard catch-all (line 67).
  - Notes: `pml.casys.ai` DNS points to your server (Caddy), NOT Vercel. The blog was consolidated on `casys.ai/blog`. Any existing links or search indexing for `pml.casys.ai/blog/*` need 301 to preserve link equity. After editing Caddyfile: `sudo systemctl reload caddy`.

### Acceptance Criteria

- [x] **AC 1**: Given casys.ai is crawled by DataForSEO, when checking duplicate titles, then 0 pages have duplicate titles (was 22/31)
- [x] **AC 2**: Given casys.ai is crawled by DataForSEO, when checking duplicate descriptions, then 0 pages have duplicate descriptions (was 22/31)
- [x] **AC 3**: Given the homepage at casys.ai, when viewing page source, then `<title>` contains "MCP" and "Casys AI" (keyword-optimized)
- [x] **AC 4**: Given `/about` page, when viewing page source, then `<title>` is different from homepage title
- [x] **AC 5**: Given each use-case page (3 pages × 3 locales), when viewing page source, then each has a unique `<title>` and `<meta description>`
- [x] **AC 6**: Given a blog article page (e.g. `/blog/why-mcp-protocol`), when testing with Google Rich Results Test, then Article structured data is detected with headline, datePublished, author, and publisher
- [x] **AC 7**: Given the blog index page (`/blog`), when viewing page source, then no Article JSON-LD is present (only on article detail pages)
- [x] **AC 8**: Given a product page (e.g. `/mcp-server`, accessed via `mcp-server.casys.ai`), when testing with Google Rich Results Test, then SoftwareApplication structured data is detected with name, description, and offers
- [x] **AC 9**: Given `pml.casys.ai/blog/why-mcp-protocol` is requested, when checking HTTP response, then status is 301 with Location header pointing to `casys.ai/blog/why-mcp-protocol` (Caddyfile redirect)
- [x] **AC 10**: Given FR pages (`/fr/`, `/fr/about`, `/fr/use-cases`), when viewing page source, then titles are localized in French and unique per page
- [x] **AC 11**: Given all existing pages that currently work, when deployed, then no 404 errors are introduced (regression check)
- [x] **AC 12**: Given a product page (e.g. `/mcp-server`, `/fr/mcp-server`, `/zh/mcp-server`), when viewing page source, then `<link rel="alternate" hreflang="...">` tags are present for all 3 locales
- [x] **AC 13**: Given PML Astro pages (e.g. `casys.ai/pml`), when viewing page source, then `<link rel="canonical">` points to `https://casys.ai/pml` (NOT `pml.casys.ai/pml/` — no double-path, no cross-site)
- [x] **AC 14**: Given all product pages (mcp-server, mcp-bridge, mcp-std, pml), when viewing page source, then `<title>` starts with a keyword (NOT with `@casys/` package name)
- [x] **AC 15**: Given `pml.casys.ai` (Fresh site), when viewing page source, then `<link rel="canonical" href="https://pml.casys.ai/">` is present
- [x] **AC 16**: Given `pml.casys.ai` (Fresh site), when testing with Google Rich Results Test, then SoftwareApplication structured data is detected with name "Casys PML"

## Additional Context

### Dependencies

- No new packages needed
- DataForSEO token in Windmill (`f/openclaw/dataforseo_token`) for verification
- Google Search Console for post-deploy indexing request
- Vercel deploy pipeline (existing)

### Testing Strategy

- **Automated**: DataForSEO on-page crawl post-deploy → compare with baseline (22 dup titles → 0)
- **Schema validation**: Google Rich Results Test on 1 blog article + 1 product page
- **Redirect verification**: `curl -I https://pml.casys.ai/blog/why-mcp-protocol` → expect 301
- **Regression**: Visual check of homepage, about, use-cases, blog, mcp-server pages
- **Timeline**: SERP ranking changes take 2-4 weeks. Re-check keyword positions via DataForSEO SERP API.

### Notes

**Risk: Title keyword optimization vs brand authenticity**
Casys positions as a research lab, not a product vendor. Titles like "MCP Server Framework" are accurate for the products but the homepage title needs to balance SEO keywords with the "Applied AI Research" identity. The proposed homepage title `"MCP Server Framework & GraphRAG Engine | Casys AI"` leads with products. If this feels wrong, alternatives:
- `"Casys AI — MCP Infrastructure & GraphRAG for AI Agents"`
- `"Applied AI Research | MCP Server & GraphRAG Tools — Casys AI"`

**Risk: Oracle NetSuite "MCP Standard Tools" collision**
The keyword "MCP standard tools" is dominated by Oracle NetSuite's product. mcp-std.casys.ai should NOT target this keyword. Instead, target "MCP tools collection" or "standard MCP tools for AI" in the page title.

**Future considerations (out of scope):**
- "context engineering" content series ($24.93 CPC, unique angle for Casys)
- "MCP apps" keyword growing +39% — align with @casys/mcp-bridge positioning
- Blog expansion: "Complete MCP Protocol Guide 2026" targeting 8.1K/mo keyword
- Backlink outreach to MCP community, awesome-mcp lists

**DataForSEO Audit Baseline (2026-02-27):**
- On-page score: 93.48/100
- Duplicate titles: 22/31 → target: 0
- Duplicate descriptions: 22/31 → target: 0
- Titles too short: 11/31 → target: ≤3
- Low content rate: 19/31 (content issue, out of scope)

**Keyword data (DataForSEO live):**

| Keyword | Vol/mo | CPC | Trend | casys.ai |
|---------|--------|-----|-------|----------|
| MCP server | 49,500 | $4.91 | ↓ -23% | Absent |
| Model Context Protocol | 22,200 | $6.19 | ↓ -33% | Absent |
| MCP protocol | 8,100 | $4.71 | ↓ -37% | Absent |
| GraphRAG | 4,400 | $5.65 | ↓ -25% | Absent |
| context engineering | 3,600 | **$24.93** | ↓ post-hype | Absent |
| MCP apps | 880 | $8.74 | **↑ +39%** | Absent |
| MCP gateway | 1,000 | $8.34 | stable | Absent |
| MCP bridge | 140 | $6.11 | ↓ | Absent top 96 |
| mcp server framework | 40 | $9.38 | ↑ growing | Absent |

## Review Notes

- Adversarial review completed: 14 findings total
- 13 fixed (F1-F13), 1 skipped as noise (F14: pre-existing content inconsistency)
- Resolution approach: auto-fix all real findings
- Key fixes applied:
  - F1 (Critical): Added canonical + hreflang to BlogLayout
  - F2 (High): Article JSON-LD `@id` now locale-aware
  - F3 (High): HrefLang component accepts optional `siteUrl` prop
  - F4 (High): Fresh PML landing now has hreflang tags (cross-domain to Astro FR/ZH)
  - F5 (High): Removed duplicate `<meta name="description">` in BlogLayout
  - F6/F7 (Medium): XSS mitigation via `.replace(/</g, '\\u003c')` on all JSON-LD
  - F8 (Medium): Article author uses prop when available (Person vs Organization)
  - F9 (Medium): PML JSON-LD description aligned (uses resolvedDescription)
  - F10 (Medium): Article image only emitted when siteUrl is set (absolute URLs only)
  - F11 (Low): Added softwareVersion to mcp-server (0.8.0) and mcp-bridge (0.2.0)
  - F12 (Low): Caddyfile `/blog*` split into `/blog` + `/blog/*`
  - F13 (Low): Added `og:site_name` to all 4 Astro layouts
