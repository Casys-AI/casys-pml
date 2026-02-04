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
    <div class="min-h-screen bg-[#08080a] text-stone-100 font-sans">
      <VitrineHeader activePage="catalog" user={user} isCloudMode={isCloudMode} />

      <div class="flex flex-col md:flex-row min-h-[calc(100vh-60px)] pt-[60px]">
        {sidebar && (
          <aside class="w-full md:w-60 lg:w-70 flex-shrink-0 bg-[#0c0c0e] border-b md:border-b-0 md:border-r border-amber-400/[0.06] md:sticky md:top-[60px] md:h-[calc(100vh-60px)] md:overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-amber-400/15 hover:scrollbar-thumb-amber-400/25">
            <div class="p-4 md:p-6">{sidebar}</div>
          </aside>
        )}

        <main class="flex-1 min-w-0 p-4 md:p-8 bg-gradient-to-br from-amber-400/[0.01] to-transparent">
          {children}
        </main>
      </div>

      <footer class="bg-[#0c0c0e] border-t border-amber-400/[0.06] px-8 py-6">
        <div class="max-w-[1400px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
          <span class="font-serif text-lg text-amber-400">Casys PML</span>
          <div class="flex gap-6">
            <a href="https://casys.ai" target="_blank" rel="noopener" class="text-stone-500 hover:text-stone-400 text-sm transition-colors">
              Casys.ai
            </a>
            <a href="https://github.com/Casys-AI/casys-pml" target="_blank" rel="noopener" class="text-stone-500 hover:text-stone-400 text-sm transition-colors">
              GitHub
            </a>
            <a href="/docs" class="text-stone-500 hover:text-stone-400 text-sm transition-colors">
              Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
