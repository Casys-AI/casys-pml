/**
 * Landing V2 Components
 *
 * Barrel export for all V2 landing page components.
 * Structure Atomic Design : Atoms → Molecules → Organisms → Sections
 *
 * @module web/components/landing-v2
 */

// Atoms
export * from "./atoms/index.ts";

// Molecules
export * from "./molecules/index.ts";

// Organisms
export * from "./organisms/index.ts";

// Sections
export { HeroSectionV2 } from "./sections/HeroSectionV2.tsx";
export { ProblemSection } from "./sections/ProblemSection.tsx";
export { SolutionSection } from "./sections/SolutionSection.tsx";
export { CatalogPreviewSectionV2 } from "./sections/CatalogPreviewSectionV2.tsx";
export { QuickStartSectionV2 } from "./sections/QuickStartSectionV2.tsx";
export { BlogSectionV2 } from "./sections/BlogSectionV2.tsx";
export { BetaSignupSectionV2 } from "./sections/BetaSignupSectionV2.tsx";
export { CTASectionV2 } from "./sections/CTASectionV2.tsx";
