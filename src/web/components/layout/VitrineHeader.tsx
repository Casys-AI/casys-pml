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
  /** Current page for active state */
  activePage?: "home" | "docs" | "blog" | "catalog";
  /** User info for auth display */
  user?: {
    username: string;
    avatarUrl?: string;
  } | null;
  /** Is cloud mode */
  isCloudMode?: boolean;
  /** Optional children (e.g., search bar) */
  children?: ComponentChildren;
}

export default function VitrineHeader({
  activePage,
  user,
  isCloudMode,
  children,
}: VitrineHeaderProps) {
  // Feature flag - set to true to show auth UI
  const SHOW_AUTH = false;

  const navLinks = [
    { href: "/#problem", label: "Why", page: null },
    { href: "/#how", label: "How", page: null },
    { href: "/#tech", label: "Tech", page: null },
    { href: "/docs", label: "Docs", page: "docs" as const },
    { href: "/blog", label: "Blog", page: "blog" as const },
    { href: "/catalog", label: "Catalog", page: "catalog" as const },
  ];

  return (
    <header class="vitrine-header">
      <div class="vitrine-header-inner">
        {/* Logo */}
        <a href="/" class="vitrine-logo">
          <span class="vitrine-logo-mark">Casys PML</span>
          <span class="vitrine-logo-text">Procedural Memory Layer</span>
        </a>

        {/* Optional center content (search, etc.) */}
        {children && <div class="vitrine-header-center">{children}</div>}

        {/* Navigation */}
        <nav class="vitrine-nav">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              class={`vitrine-nav-link ${activePage === link.page ? "active" : ""}`}
            >
              {link.label}
            </a>
          ))}

          {/* GitHub */}
          <a
            href="https://github.com/Casys-AI/casys-pml"
            class="vitrine-nav-link vitrine-nav-github"
            target="_blank"
            rel="noopener"
            title="View on GitHub"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>

          {/* Auth section */}
          {SHOW_AUTH &&
            (isCloudMode
              ? user
                ? (
                  <a href="/dashboard/settings" class="vitrine-nav-user">
                    <img
                      src={user.avatarUrl || "/default-avatar.svg"}
                      alt={user.username}
                      class="vitrine-nav-avatar"
                    />
                    <span class="vitrine-nav-username">{user.username}</span>
                  </a>
                )
                : (
                  <a href="/auth/signin" class="vitrine-btn-signin">
                    Sign in
                  </a>
                )
              : (
                <span class="vitrine-badge-local">
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

          {/* Mobile Menu */}
          <MobileMenu />
        </nav>
      </div>

      <style>
        {`
        .vitrine-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 0.875rem 2rem;
          background: rgba(8, 8, 10, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 184, 111, 0.08);
        }

        .vitrine-header-inner {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 2rem;
        }

        .vitrine-header-center {
          flex: 1;
          display: flex;
          justify-content: center;
          max-width: 400px;
        }

        .vitrine-logo {
          display: flex;
          align-items: center;
          gap: 0.875rem;
          text-decoration: none;
          flex-shrink: 0;
        }

        .vitrine-logo-mark {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 1.375rem;
          font-weight: 400;
          color: #FFB86F;
          letter-spacing: -0.02em;
        }

        .vitrine-logo-text {
          font-size: 0.7rem;
          color: #6b6560;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          display: none;
        }

        @media (min-width: 768px) {
          .vitrine-logo-text {
            display: block;
          }
        }

        .vitrine-nav {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .vitrine-nav-link {
          color: #a8a29e;
          text-decoration: none;
          font-size: 0.875rem;
          font-weight: 500;
          transition: color 0.2s;
          position: relative;
        }

        .vitrine-nav-link:hover {
          color: #f0ede8;
        }

        .vitrine-nav-link.active {
          color: #FFB86F;
        }

        .vitrine-nav-link.active::after {
          content: '';
          position: absolute;
          bottom: -0.5rem;
          left: 0;
          right: 0;
          height: 2px;
          background: #FFB86F;
          border-radius: 1px;
        }

        .vitrine-nav-github {
          display: flex;
          align-items: center;
          padding: 0.5rem;
          border-radius: 6px;
          transition: background 0.2s;
        }

        .vitrine-nav-github:hover {
          background: rgba(255, 184, 111, 0.1);
        }

        .vitrine-btn-signin {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          font-weight: 600;
          text-decoration: none;
          border-radius: 8px;
          background: #FFB86F;
          color: #08080a;
          transition: all 0.2s;
        }

        .vitrine-btn-signin:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }

        .vitrine-badge-local {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
          font-family: 'Geist Mono', monospace;
          color: #4ade80;
          background: rgba(74, 222, 128, 0.1);
          border: 1px solid rgba(74, 222, 128, 0.2);
          border-radius: 6px;
        }

        .vitrine-nav-user {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.375rem 0.75rem;
          text-decoration: none;
          border-radius: 8px;
          background: rgba(255, 184, 111, 0.1);
          border: 1px solid rgba(255, 184, 111, 0.08);
          transition: all 0.2s;
        }

        .vitrine-nav-user:hover {
          border-color: #FFB86F;
        }

        .vitrine-nav-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          object-fit: cover;
        }

        .vitrine-nav-username {
          font-size: 0.875rem;
          font-weight: 500;
          color: #f0ede8;
        }

        /* Hide nav links on mobile, show hamburger */
        @media (max-width: 768px) {
          .vitrine-nav-link:not(.vitrine-nav-github) {
            display: none;
          }
          .vitrine-btn-signin,
          .vitrine-badge-local,
          .vitrine-nav-user {
            display: none;
          }
        }
        `}
      </style>
    </header>
  );
}
