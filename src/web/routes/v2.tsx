/**
 * Landing Page V2
 *
 * "The Gateway for the Conversational Web"
 * New positioning: boring infrastructure, no AI hype.
 *
 * @module web/routes/v2
 */

import { page } from "fresh";
import type { FreshContext } from "fresh";
import { Head } from "fresh/runtime";
import { formatDate, getPosts, type Post } from "../utils/posts.ts";
import type { AuthState } from "./_middleware.ts";

// Components
import VitrineHeader from "../components/layout/VitrineHeader.tsx";
import {
  HeroSectionV2,
  ProblemSection,
  SolutionSection,
  CatalogPreviewSectionV2,
  QuickStartSectionV2,
  BlogSectionV2,
  BetaSignupSectionV2,
  CTASectionV2,
} from "../components/landing-v2/index.ts";
import { GoogleAnalytics } from "../components/GoogleAnalytics.tsx";

// Content
import { meta, footer } from "../content/landing-v2.ts";

interface LandingV2PageData {
  latestPosts: Post[];
  isCloudMode: boolean;
  user: AuthState["user"];
}

export const handler = {
  async GET(ctx: FreshContext<AuthState>) {
    // Preview mode: only accessible with ?preview=casys
    const url = new URL(ctx.req.url);
    if (url.searchParams.get("preview") !== "casys") {
      return new Response(null, {
        status: 302,
        headers: { Location: "/" },
      });
    }

    try {
      const posts = await getPosts();
      const latestPosts = posts.slice(0, 3);
      return page({
        latestPosts,
        isCloudMode: ctx.state.isCloudMode,
        user: ctx.state.user,
      });
    } catch (error) {
      console.error("Error loading posts for landing v2:", error);
      return page({
        latestPosts: [],
        isCloudMode: ctx.state.isCloudMode,
        user: ctx.state.user,
      });
    }
  },
};

export default function LandingV2Page({ data }: { data: LandingV2PageData }) {
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
        <meta property="og:url" content="https://pml.casys.ai/v2" />
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

      <div class="min-h-screen bg-[#08080a] text-stone-100 font-sans relative overflow-x-hidden selection:bg-pml-accent selection:text-stone-950">
        <VitrineHeader activePage="home" user={user} isCloudMode={isCloudMode} />

        <main>
          <HeroSectionV2 />
          <ProblemSection />
          <SolutionSection />
          <CatalogPreviewSectionV2 />
          <QuickStartSectionV2 />
          <BlogSectionV2 posts={latestPosts} formatDate={formatDate} />
          <BetaSignupSectionV2 />
          <CTASectionV2 />
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
    <footer class="relative py-6 px-8 sm:px-5 bg-[#08080a] border-t border-white/[0.04]">
      <div class="max-w-[1100px] mx-auto flex justify-between items-center max-md:flex-col max-md:gap-4 max-md:text-center">
        <div class="flex items-center gap-3">
          <span class="font-serif text-lg text-pml-accent">{footer.brand.name}</span>
          <span class="text-[0.65rem] text-stone-600 uppercase tracking-wide">
            {footer.brand.tagline}
          </span>
        </div>
        <div class="flex gap-6">
          {footer.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener" : undefined}
              class="text-stone-500 no-underline text-[0.8rem] transition-colors duration-200 hover:text-pml-accent"
            >
              {link.label}
            </a>
          ))}
          {!isCloudMode && (
            <a
              href="/dashboard"
              class="text-stone-500 no-underline text-[0.8rem] transition-colors duration-200 hover:text-pml-accent"
            >
              App
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
