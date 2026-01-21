/**
 * Landing Page (Vitrine)
 *
 * Main marketing/showcase page for Casys PML.
 * Uses atomic design with content separated from structure.
 *
 * @module web/routes/index
 */

import { page } from "fresh";
import type { FreshContext } from "fresh";
import { Head } from "fresh/runtime";
import { formatDate, getPosts, type Post } from "../utils/posts.ts";
import type { AuthState } from "./_middleware.ts";

// Components
import VitrineHeader from "../components/layout/VitrineHeader.tsx";
import {
  HeroSection,
  IntelligenceSection,
  ArchitectureSection,
  CatalogPreviewSection,
  QuickStartSection,
  BlogSection,
  BetaSignupSection,
  CTASection,
} from "../components/landing/index.ts";
import { GoogleAnalytics } from "../components/GoogleAnalytics.tsx";

// Content
import { meta, footer } from "../content/landing.ts";

interface LandingPageData {
  latestPosts: Post[];
  isCloudMode: boolean;
  user: AuthState["user"];
}

export const handler = {
  async GET(ctx: FreshContext<AuthState>) {
    try {
      const posts = await getPosts();
      const latestPosts = posts.slice(0, 3);
      return page({
        latestPosts,
        isCloudMode: ctx.state.isCloudMode,
        user: ctx.state.user,
      });
    } catch (error) {
      console.error("Error loading posts for landing page:", error);
      return page({
        latestPosts: [],
        isCloudMode: ctx.state.isCloudMode,
        user: ctx.state.user,
      });
    }
  },
};

export default function LandingPage({ data }: { data: LandingPageData }) {
  const { latestPosts, isCloudMode, user } = data;

  return (
    <>
      <GoogleAnalytics />
      <Head>
        <title>{meta.title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={meta.description} />

        {/* Open Graph / LinkedIn */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://pml.casys.ai/" />
        <meta property="og:title" content={meta.title} />
        <meta property="og:description" content={meta.description} />
        <meta property="og:image" content={meta.ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="Casys PML" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={meta.title} />
        <meta name="twitter:description" content={meta.description} />
        <meta name="twitter:image" content={meta.ogImage} />

        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />

        {/* Critical CSS */}
        <style>{`html,body{background:#0a0908;margin:0}`}</style>
      </Head>

      <div class="landing-page">
        {/* Header */}
        <VitrineHeader activePage="home" user={user} isCloudMode={isCloudMode} />

        {/* Main Content */}
        <main>
          {/* Hero */}
          <HeroSection />

          {/* Intelligence - right after Hero */}
          <IntelligenceSection />

          {/* Architecture */}
          <ArchitectureSection />

          {/* Catalog Preview */}
          <CatalogPreviewSection />

          {/* Quick Start */}
          <QuickStartSection />

          {/* Blog */}
          <BlogSection posts={latestPosts} formatDate={formatDate} />

          {/* Beta Signup */}
          <BetaSignupSection />

          {/* CTA */}
          <CTASection />
        </main>

        {/* Footer */}
        <Footer isCloudMode={isCloudMode} />

        <style>
          {`
          .landing-page {
            min-height: 100vh;
            background: #08080a;
            color: #f0ede8;
            font-family: 'Geist', -apple-system, system-ui, sans-serif;
            position: relative;
            overflow-x: hidden;
          }

          ::selection {
            background: #FFB86F;
            color: #08080a;
          }

          html {
            scroll-behavior: smooth;
            scroll-padding-top: 80px;
          }
          `}
        </style>
      </div>
    </>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface FooterProps {
  isCloudMode: boolean;
}

function Footer({ isCloudMode }: FooterProps) {
  return (
    <footer class="landing-footer">
      <div class="landing-footer__inner">
        <div class="landing-footer__brand">
          <span class="landing-footer__logo">{footer.brand.name}</span>
          <span class="landing-footer__tagline">{footer.brand.tagline}</span>
        </div>
        <div class="landing-footer__links">
          {footer.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener" : undefined}
            >
              {link.label}
            </a>
          ))}
          {!isCloudMode && <a href="/dashboard">Dashboard</a>}
        </div>
      </div>

      <style>
        {`
        .landing-footer {
          position: relative;
          z-index: 10;
          padding: 2rem;
          background: #08080a;
          border-top: 1px solid rgba(255, 184, 111, 0.08);
        }

        .landing-footer__inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .landing-footer__brand {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .landing-footer__logo {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 1.375rem;
          color: #FFB86F;
        }

        .landing-footer__tagline {
          font-size: 0.75rem;
          color: #6b6560;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .landing-footer__links {
          display: flex;
          gap: 2rem;
        }

        .landing-footer__links a {
          color: #a8a29e;
          text-decoration: none;
          font-size: 0.875rem;
          transition: color 0.2s;
        }

        .landing-footer__links a:hover {
          color: #FFB86F;
        }

        @media (max-width: 768px) {
          .landing-footer__inner {
            flex-direction: column;
            gap: 1.5rem;
            text-align: center;
          }
        }
        `}
      </style>
    </footer>
  );
}
