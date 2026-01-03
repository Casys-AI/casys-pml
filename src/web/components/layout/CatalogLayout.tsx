/**
 * CatalogLayout - Layout for the Registry Catalog
 *
 * Features:
 * - Vitrine header (marketing/showcase style)
 * - Left sidebar for filters
 * - Main content area for catalog grid
 * - Dark mode, marketplace aesthetic
 *
 * @module web/components/layout/CatalogLayout
 */

import type { ComponentChildren } from "preact";
import VitrineHeader from "./VitrineHeader.tsx";

interface CatalogLayoutProps {
  children: ComponentChildren;
  sidebar?: ComponentChildren;
  user?: {
    username: string;
    avatarUrl?: string;
  } | null;
  isCloudMode?: boolean;
}

export default function CatalogLayout({
  children,
  sidebar,
  user,
  isCloudMode,
}: CatalogLayoutProps) {
  return (
    <div class="catalog-page">
      {/* Vitrine Header */}
      <VitrineHeader activePage="catalog" user={user} isCloudMode={isCloudMode} />

      {/* Main Layout */}
      <div class="catalog-layout">
        {/* Left Sidebar - Filters */}
        {sidebar && (
          <aside class="catalog-sidebar">
            <div class="catalog-sidebar-inner">{sidebar}</div>
          </aside>
        )}

        {/* Main Content */}
        <main class="catalog-main">{children}</main>
      </div>

      {/* Footer */}
      <footer class="catalog-footer">
        <div class="catalog-footer-inner">
          <span class="catalog-footer-brand">Casys PML</span>
          <div class="catalog-footer-links">
            <a href="https://casys.ai" target="_blank" rel="noopener">
              Casys.ai
            </a>
            <a href="https://github.com/Casys-AI/casys-pml" target="_blank" rel="noopener">
              GitHub
            </a>
            <a href="/docs">Docs</a>
          </div>
        </div>
      </footer>

      <style>
        {`
        /* ═══════════════════════════════════════════════════════════════════
           CATALOG LAYOUT - Marketplace Aesthetic
        ═══════════════════════════════════════════════════════════════════ */

        .catalog-page {
          min-height: 100vh;
          background: #08080a;
          color: #f0ede8;
          font-family: 'Geist', -apple-system, system-ui, sans-serif;
        }

        .catalog-layout {
          display: flex;
          min-height: calc(100vh - 60px);
          padding-top: 60px; /* Header height */
        }

        /* ═══════════════════════════════════════════════════════════════════
           SIDEBAR
        ═══════════════════════════════════════════════════════════════════ */

        .catalog-sidebar {
          width: 280px;
          flex-shrink: 0;
          background: #0c0c0e;
          border-right: 1px solid rgba(255, 184, 111, 0.06);
          position: sticky;
          top: 60px;
          height: calc(100vh - 60px);
          overflow-y: auto;
        }

        .catalog-sidebar-inner {
          padding: 1.5rem;
        }

        /* Custom scrollbar for sidebar */
        .catalog-sidebar::-webkit-scrollbar {
          width: 6px;
        }

        .catalog-sidebar::-webkit-scrollbar-track {
          background: transparent;
        }

        .catalog-sidebar::-webkit-scrollbar-thumb {
          background: rgba(255, 184, 111, 0.15);
          border-radius: 3px;
        }

        .catalog-sidebar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 184, 111, 0.25);
        }

        /* ═══════════════════════════════════════════════════════════════════
           MAIN CONTENT
        ═══════════════════════════════════════════════════════════════════ */

        .catalog-main {
          flex: 1;
          min-width: 0;
          padding: 2rem;
          background: linear-gradient(
            135deg,
            rgba(255, 184, 111, 0.01) 0%,
            transparent 50%
          );
        }

        /* ═══════════════════════════════════════════════════════════════════
           FOOTER
        ═══════════════════════════════════════════════════════════════════ */

        .catalog-footer {
          background: #0c0c0e;
          border-top: 1px solid rgba(255, 184, 111, 0.06);
          padding: 1.5rem 2rem;
        }

        .catalog-footer-inner {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .catalog-footer-brand {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 1.125rem;
          color: #FFB86F;
        }

        .catalog-footer-links {
          display: flex;
          gap: 1.5rem;
        }

        .catalog-footer-links a {
          color: #6b6560;
          text-decoration: none;
          font-size: 0.875rem;
          transition: color 0.2s;
        }

        .catalog-footer-links a:hover {
          color: #a8a29e;
        }

        /* ═══════════════════════════════════════════════════════════════════
           RESPONSIVE
        ═══════════════════════════════════════════════════════════════════ */

        @media (max-width: 1024px) {
          .catalog-sidebar {
            width: 240px;
          }
        }

        @media (max-width: 768px) {
          .catalog-layout {
            flex-direction: column;
          }

          .catalog-sidebar {
            width: 100%;
            height: auto;
            position: static;
            border-right: none;
            border-bottom: 1px solid rgba(255, 184, 111, 0.06);
          }

          .catalog-sidebar-inner {
            padding: 1rem;
          }

          .catalog-main {
            padding: 1rem;
          }

          .catalog-footer-inner {
            flex-direction: column;
            gap: 1rem;
            text-align: center;
          }
        }
        `}
      </style>
    </div>
  );
}
