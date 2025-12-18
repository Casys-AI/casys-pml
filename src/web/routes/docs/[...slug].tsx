// @ts-nocheck: Documentation page with complex nested navigation
import { HttpError, page } from "fresh";
import { Head } from "fresh/runtime";
import { PRISM_THEME_CSS } from "../../utils/prism-theme.ts";
import {
  getDocPage,
  getDocsNavigation,
  type DocNavItem,
  type DocPage,
} from "../../utils/docs.ts";
import DocsSidebar from "../../islands/DocsSidebar.tsx";
import DocsToc from "../../islands/DocsToc.tsx";
import MobileMenu from "../../islands/MobileMenu.tsx";

interface DocsPageData {
  doc: DocPage;
  navigation: DocNavItem[];
  currentPath: string;
}

export const handler = {
  async GET(ctx: any) {
    try {
      // slug can be undefined (root), string, or string[]
      const slugParam = ctx.params.slug;
      const slugParts: string[] = slugParam
        ? Array.isArray(slugParam)
          ? slugParam
          : slugParam.split("/")
        : [];

      const doc = await getDocPage(slugParts);

      if (!doc) {
        throw new HttpError(404, "Documentation page not found");
      }

      const navigation = await getDocsNavigation();
      const currentPath = "/docs" + (slugParts.length > 0 ? "/" + slugParts.join("/") : "");

      return page({ doc, navigation, currentPath });
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      console.error(`Error loading doc:`, error);
      throw new HttpError(500, "Internal server error");
    }
  },
};

// Navigation component moved to islands/DocsSidebar.tsx for interactivity

export default function DocsPage({ data }: { data: DocsPageData }) {
  const { doc, navigation, currentPath } = data;

  return (
    <>
      <Head>
        <title>{doc.title} - Casys PML Docs</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={doc.description} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: PRISM_THEME_CSS }} />
      </Head>

      <div class="docs-page">
        {/* Header */}
        <header class="header">
          <div class="header-inner">
            <a href="/" class="logo">
              <span class="logo-mark">Casys PML</span>
              <span class="logo-text">Documentation</span>
            </a>
            <nav class="nav">
              <a href="/" class="nav-link">Home</a>
              <a href="/blog" class="nav-link">Blog</a>
              <a href="/docs" class="nav-link nav-link-active">Docs</a>
              <a
                href="https://github.com/Casys-AI/casys-pml"
                class="nav-link-github"
                target="_blank"
                rel="noopener"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </a>
              <MobileMenu />
            </nav>
          </div>
        </header>

        <div class="docs-layout">
          {/* Sidebar - Interactive Island */}
          <DocsSidebar navigation={navigation} currentPath={currentPath} />

          {/* Main Content */}
          <main class="docs-main">
            {/* Breadcrumbs */}
            <nav class="breadcrumbs">
              {doc.breadcrumbs.map((crumb, index) => (
                <span key={crumb.href}>
                  {index > 0 && <span class="breadcrumb-sep">/</span>}
                  {index === doc.breadcrumbs.length - 1 ? (
                    <span class="breadcrumb-current">{crumb.label}</span>
                  ) : (
                    <a href={crumb.href} class="breadcrumb-link">{crumb.label}</a>
                  )}
                </span>
              ))}
            </nav>

            {/* Document Content */}
            <article class="doc-content markdown-body">
              <div dangerouslySetInnerHTML={{ __html: doc.html }} />
            </article>
          </main>

          {/* Table of Contents - Right sidebar (dynamic, extracts headings from DOM) */}
          <DocsToc />
        </div>

        <style>
          {`
          :root {
            --bg: #08080a;
            --bg-elevated: #0f0f12;
            --bg-card: #141418;
            --accent: #FFB86F;
            --accent-dim: rgba(255, 184, 111, 0.1);
            --accent-medium: rgba(255, 184, 111, 0.2);
            --purple: #a78bfa;
            --text: #f0ede8;
            --text-muted: #a8a29e;
            --text-dim: #6b6560;
            --border: rgba(255, 184, 111, 0.08);
            --border-strong: rgba(255, 184, 111, 0.15);
            --font-display: 'Instrument Serif', Georgia, serif;
            --font-sans: 'Geist', -apple-system, system-ui, sans-serif;
            --font-mono: 'Geist Mono', monospace;
            --sidebar-width: 280px;
          }

          * { margin: 0; padding: 0; box-sizing: border-box; }

          .docs-page {
            min-height: 100vh;
            background: var(--bg);
            color: var(--text);
            font-family: var(--font-sans);
            display: flex;
            flex-direction: column;
            overflow-x: hidden;
          }

          /* Header */
          .header {
            position: sticky;
            top: 0;
            z-index: 100;
            padding: 1rem 2rem;
            background: rgba(8, 8, 10, 0.95);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border);
          }

          .header-inner {
            max-width: 1400px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .logo {
            display: flex;
            align-items: center;
            gap: 1rem;
            text-decoration: none;
          }

          .logo-mark {
            font-family: var(--font-display);
            font-size: 1.5rem;
            color: var(--accent);
          }

          .logo-text {
            font-size: 0.75rem;
            color: var(--text-dim);
            letter-spacing: 0.1em;
            text-transform: uppercase;
          }

          .nav {
            display: flex;
            align-items: center;
            gap: 2rem;
          }

          .nav-link {
            color: var(--text-muted);
            text-decoration: none;
            font-size: 0.875rem;
            font-weight: 500;
            transition: color 0.2s;
          }

          .nav-link:hover, .header .nav-link-active {
            color: var(--accent);
          }

          .nav-link-github {
            display: flex;
            align-items: center;
            padding: 0.5rem;
            color: var(--text-muted);
            border-radius: 6px;
            transition: all 0.2s;
          }

          .nav-link-github:hover {
            color: var(--text);
            background: var(--accent-dim);
          }

          /* Docs Layout */
          .docs-layout {
            display: flex;
            flex: 1;
            max-width: 1400px;
            margin: 0 auto;
            width: 100%;
          }

          /* Sidebar */
          .sidebar {
            width: var(--sidebar-width);
            flex-shrink: 0;
            border-right: 1px solid var(--border);
            background: var(--bg-elevated);
            position: sticky;
            top: 65px;
            height: calc(100vh - 65px);
            overflow-y: auto;
          }

          .sidebar-header {
            padding: 1.5rem;
            border-bottom: 1px solid var(--border);
          }

          .sidebar-title {
            font-family: var(--font-display);
            font-size: 1.25rem;
            color: var(--text);
            text-decoration: none;
          }

          .sidebar-nav {
            padding: 1rem 0;
          }

          .nav-list {
            list-style: none;
          }

          .nav-item {
            margin: 0;
          }

          .sidebar-nav .nav-link {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1.5rem;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 0.875rem;
            transition: all 0.2s;
            border-left: 2px solid transparent;
          }

          .sidebar-nav .nav-link:hover {
            color: var(--text);
            background: var(--accent-dim);
          }

          .sidebar-nav .nav-link-active {
            color: var(--accent);
            background: var(--accent-dim);
            border-left-color: var(--accent);
          }

          .sidebar-nav .nav-link-parent {
            color: var(--text);
          }

          .nav-arrow {
            display: flex;
            transition: transform 0.2s;
          }

          .nav-arrow-expanded {
            transform: rotate(90deg);
          }

          .nav-children {
            list-style: none;
          }

          /* Main Content */
          .docs-main {
            flex: 1;
            min-width: 0;
            padding: 2rem 3rem;
          }

          /* Breadcrumbs */
          .breadcrumbs {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 2rem;
            font-size: 0.875rem;
          }

          .breadcrumb-link {
            color: var(--text-muted);
            text-decoration: none;
            transition: color 0.2s;
          }

          .breadcrumb-link:hover {
            color: var(--accent);
          }

          .breadcrumb-sep {
            color: var(--text-dim);
          }

          .breadcrumb-current {
            color: var(--text);
          }

          /* Document Content - Markdown */
          .doc-content.markdown-body {
            background: transparent !important;
            color: var(--text) !important;
            font-family: var(--font-sans);
            font-size: 1rem;
            line-height: 1.8;
            max-width: 800px;
          }

          .markdown-body h1 {
            font-family: var(--font-display);
            font-size: 2.25rem;
            font-weight: 400;
            color: var(--text);
            margin-bottom: 1rem;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid var(--border);
          }

          .markdown-body h2 {
            font-family: var(--font-display);
            font-size: 1.5rem;
            font-weight: 400;
            color: var(--text);
            margin-top: 2.5rem;
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid var(--border);
          }

          .markdown-body h3 {
            font-family: var(--font-display);
            font-size: 1.25rem;
            font-weight: 400;
            color: var(--text);
            margin-top: 2rem;
            margin-bottom: 0.75rem;
          }

          .markdown-body h4 {
            font-size: 1rem;
            font-weight: 600;
            color: var(--text);
            margin-top: 1.5rem;
            margin-bottom: 0.5rem;
          }

          .markdown-body p {
            margin-bottom: 1rem;
            color: var(--text-muted);
          }

          .markdown-body a {
            color: var(--accent);
            text-decoration: none;
          }

          .markdown-body a:hover {
            text-decoration: underline;
          }

          .markdown-body strong {
            color: var(--text);
            font-weight: 600;
          }

          /* Inline code */
          .markdown-body code:not(pre code) {
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            padding: 0.15em 0.4em;
            border-radius: 4px;
            font-family: var(--font-mono);
            font-size: 0.875em;
            color: #ce9178;
          }

          /* Code blocks */
          .markdown-body pre {
            background: #1a1a1d !important;
            border: 1px solid var(--border-strong) !important;
            border-radius: 8px;
            padding: 1rem !important;
            overflow-x: auto;
            margin: 1rem 0 !important;
          }

          .markdown-body pre:hover {
            border-color: var(--accent) !important;
          }

          .markdown-body pre code {
            background: transparent !important;
            border: none !important;
            padding: 0 !important;
            font-size: 0.875rem !important;
            line-height: 1.6 !important;
            color: #d4d4d4 !important;
            font-family: var(--font-mono) !important;
          }

          .markdown-body blockquote {
            border-left: 3px solid var(--accent);
            padding-left: 1rem;
            margin: 1rem 0;
            color: var(--text-muted);
            font-style: italic;
          }

          .markdown-body ul, .markdown-body ol {
            margin: 1rem 0;
            padding-left: 1.5rem;
            color: var(--text-muted);
          }

          .markdown-body li {
            margin-bottom: 0.5rem;
          }

          .markdown-body hr {
            border: none;
            border-top: 1px solid var(--border);
            margin: 2rem 0;
          }

          .markdown-body table {
            width: 100%;
            border-collapse: collapse;
            margin: 1.5rem 0;
          }

          .markdown-body th {
            background: var(--bg-elevated);
            padding: 0.75rem;
            text-align: left;
            font-weight: 600;
            color: var(--text);
            border: 1px solid var(--border);
          }

          .markdown-body td {
            padding: 0.75rem;
            border: 1px solid var(--border);
            color: var(--text-muted);
          }

          .markdown-body tr:hover td {
            background: var(--accent-dim);
          }

          .markdown-body img {
            max-width: 100%;
            border-radius: 8px;
            margin: 1rem 0;
          }

          /* Responsive */
          @media (max-width: 1024px) {
            .sidebar {
              display: none;
            }

            .docs-main {
              padding: 1.5rem;
            }
          }

          @media (max-width: 768px) {
            .header { padding: 1rem; }
            .logo-text { display: none; }
            .nav { gap: 0.75rem; }
            /* Hide desktop nav on mobile - MobileMenu handles navigation */
            .nav-link:not(.nav-link-github) { display: none; }

            .markdown-body h1 { font-size: 1.75rem; }
            .markdown-body h2 { font-size: 1.25rem; }
          }
        `}
        </style>
      </div>
    </>
  );
}
