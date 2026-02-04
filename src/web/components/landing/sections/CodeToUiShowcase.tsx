/**
 * CodeToUiShowcase - Landing page section
 *
 * "From Code to Interface" showcase section that demonstrates
 * the core value proposition: write code → get interactive UI.
 *
 * This is a thin wrapper that renders the CodeToUiCarousel island.
 * The carousel handles its own header and styling.
 *
 * @module web/components/landing/sections/CodeToUiShowcase
 */

import CodeToUiCarousel from "../../../islands/CodeToUiCarousel.tsx";

export function CodeToUiShowcase() {
  return <CodeToUiCarousel />;
}
