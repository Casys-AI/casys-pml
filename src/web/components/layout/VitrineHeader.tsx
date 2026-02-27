/**
 * VitrineHeader - Showcase/Marketing Header
 *
 * Used on public-facing pages (landing, catalog, docs, blog).
 * Fixed position with blur backdrop, navigation links.
 *
 * @module web/components/layout/VitrineHeader
 */

import type { ComponentChildren } from "preact";
import MobileMenu from "../../islands/MobileMenu.tsx";

interface VitrineHeaderProps {
  activePage?: "home" | "docs" | "catalog";
  user?: {
    username: string;
    avatarUrl?: string;
  } | null;
  isCloudMode?: boolean;
  children?: ComponentChildren;
}

export default function VitrineHeader({
  activePage,
  user,
  isCloudMode,
  children,
}: VitrineHeaderProps) {
  const SHOW_AUTH = false;

  const navLinks = [
    { href: "/#catalog", label: "Capabilities", page: null },
    { href: "/docs", label: "Docs", page: "docs" as const },
    { href: "/#beta", label: "Beta", page: null, highlight: true },
  ];

  return (
    <header class="fixed top-0 left-0 right-0 z-[100] px-8 py-3.5 bg-[#08080a]/85 backdrop-blur-[20px] border-b border-pml-accent/[0.08]">
      <div class="max-w-[1400px] mx-auto flex justify-between items-center gap-8">
        <a href="/" class="flex items-center gap-3.5 no-underline flex-shrink-0">
          <span class="font-serif text-[1.375rem] font-normal text-pml-accent tracking-tight">Casys PML</span>
          <span class="text-[0.7rem] text-stone-500 tracking-widest uppercase hidden md:block">Procedural Memory Layer</span>
        </a>

        {children && <div class="flex-1 flex justify-center max-w-[400px]">{children}</div>}

        <nav class="flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              class={`
                text-stone-400 no-underline text-sm font-medium transition-colors relative
                hover:text-stone-100
                ${activePage === link.page ? "text-pml-accent after:content-[''] after:absolute after:bottom-[-0.5rem] after:left-0 after:right-0 after:h-0.5 after:bg-pml-accent after:rounded-sm" : ""}
                ${"highlight" in link && link.highlight ? "!text-pml-accent px-3 py-1.5 bg-pml-accent/10 border border-pml-accent/25 rounded-md hover:bg-pml-accent/20 hover:border-pml-accent/40" : ""}
                hidden md:inline-block
              `}
            >
              {link.label}
            </a>
          ))}

          <a
            href="https://github.com/Casys-AI/casys-pml"
            class="flex items-center p-2 rounded-md transition-colors text-stone-400 hover:text-stone-100 hover:bg-pml-accent/10"
            target="_blank"
            rel="noopener"
            title="View on GitHub"
            aria-label="View on GitHub"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>

          <a
            href="https://discord.gg/fuPg8drR"
            class="flex items-center p-2 rounded-md transition-colors text-stone-400 hover:text-stone-100 hover:bg-pml-accent/10"
            target="_blank"
            rel="noopener"
            title="Join Discord"
            aria-label="Join Discord"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </a>

          {SHOW_AUTH &&
            (isCloudMode
              ? user
                ? (
                  <a href="/dashboard/settings" class="hidden md:flex items-center gap-2 px-3 py-1.5 no-underline rounded-lg bg-pml-accent/10 border border-pml-accent/[0.08] transition-all hover:border-pml-accent">
                    <img
                      src={user.avatarUrl || "/default-avatar.svg"}
                      alt={user.username}
                      class="w-6 h-6 rounded-full object-cover"
                    />
                    <span class="text-sm font-medium text-stone-100">{user.username}</span>
                  </a>
                )
                : (
                  <a href="/auth/signin" class="hidden md:inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold no-underline rounded-lg bg-pml-accent text-[#08080a] transition-all hover:brightness-110 hover:-translate-y-px">
                    Sign in
                  </a>
                )
              : (
                <span class="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium font-mono text-green-400 bg-green-400/10 border border-green-400/20 rounded-md">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Local
                </span>
              ))}

          <MobileMenu />
        </nav>
      </div>
    </header>
  );
}
