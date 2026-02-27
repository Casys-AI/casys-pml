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
import type { AuthState } from "./_middleware.ts";

// Components
import VitrineHeader from "../components/layout/VitrineHeader.tsx";
import {
  HeroSection,
  IntelligenceSection,
  ArchitectureSection,
  IsolationSection,
  CatalogPreviewSection,
  QuickStartSection,
  BetaSignupSection,
  CTASection,
} from "../components/landing/index.ts";
import { GoogleAnalytics } from "../components/GoogleAnalytics.tsx";

// Content
import { meta, footer } from "../content/landing.ts";

interface LandingPageData {
  isCloudMode: boolean;
  user: AuthState["user"];
}

export const handler = {
  async GET(ctx: FreshContext<AuthState>) {
    return page({
      isCloudMode: ctx.state.isCloudMode,
      user: ctx.state.user,
    });
  },
};

export default function LandingPage({ data }: { data: LandingPageData }) {
  const { isCloudMode, user } = data;

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

        {/* Canonical */}
        <link rel="canonical" href="https://pml.casys.ai/" />

        {/* HrefLang — EN on this domain, FR/ZH on Astro site */}
        <link rel="alternate" hreflang="en" href="https://pml.casys.ai/" />
        <link rel="alternate" hreflang="fr" href="https://casys.ai/fr/pml/" />
        <link rel="alternate" hreflang="zh" href="https://casys.ai/zh/pml/" />
        <link rel="alternate" hreflang="x-default" href="https://pml.casys.ai/" />

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
          }
        }).replace(/</g, '\\u003c') }} />

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
          <HeroSection />
          <IntelligenceSection />
          <ArchitectureSection />
          <IsolationSection />
          <CatalogPreviewSection />
          <QuickStartSection />
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
    <footer class="relative py-6 px-8 sm:px-5 bg-[#08080a] border-t border-white/[0.04]">
      <div class="max-w-[1100px] mx-auto flex justify-between items-center max-md:flex-col max-md:gap-4 max-md:text-center">
        <div class="flex items-center gap-3">
          <span class="font-serif text-lg text-pml-accent">{footer.brand.name}</span>
          <span class="text-[0.65rem] text-stone-600 uppercase tracking-wide">{footer.brand.tagline}</span>
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
            <a href="/dashboard" class="text-stone-500 no-underline text-[0.8rem] transition-colors duration-200 hover:text-pml-accent">
              App
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
