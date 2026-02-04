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
  IsolationSection,
  CatalogPreviewSection,
  CodeToUiShowcase,
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

      <div class="min-h-screen bg-[#08080a] text-stone-100 font-sans relative overflow-x-hidden selection:bg-amber-400 selection:text-stone-950">
        <VitrineHeader activePage="home" user={user} isCloudMode={isCloudMode} />

        <main>
          <HeroSection />
          <IntelligenceSection />
          <ArchitectureSection />
          <IsolationSection />
          <CatalogPreviewSection />
          <CodeToUiShowcase />
          <QuickStartSection />
          <BlogSection posts={latestPosts} formatDate={formatDate} />
          <BetaSignupSection />
          <CTASection />
        </main>

        <Footer isCloudMode={isCloudMode} />
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
    <footer class="relative z-10 p-8 bg-[#08080a] border-t border-amber-400/[0.08]">
      <div class="max-w-[1200px] mx-auto flex justify-between items-center max-md:flex-col max-md:gap-6 max-md:text-center">
        <div class="flex items-center gap-4">
          <span class="font-serif text-[1.375rem] text-amber-400">{footer.brand.name}</span>
          <span class="text-xs text-stone-600 uppercase tracking-widest">{footer.brand.tagline}</span>
        </div>
        <div class="flex gap-8">
          {footer.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener" : undefined}
              class="text-stone-400 no-underline text-sm transition-colors duration-200 hover:text-amber-400"
            >
              {link.label}
            </a>
          ))}
          {!isCloudMode && (
            <a href="/dashboard" class="text-stone-400 no-underline text-sm transition-colors duration-200 hover:text-amber-400">
              Dashboard
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
