/**
 * Material 3 Token Generator
 * Génère les vrais tokens M3 à partir des couleurs brand/cassis
 * Utilise @material/material-color-utilities (officiel Google)
 */

import { argbFromHex, themeFromSourceColor, applyTheme } from '@material/material-color-utilities';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Couleurs source du projet (depuis logo CASYS: gradient noir → violet #dbbddb)
const BRAND_PRIMARY = '#dbbddb';  // Violet clair from logo gradient
const CASSIS_SECONDARY = '#800080'; // Purple cassis (darker violet accent)

console.log('\n🎨 Generating Material 3 Tokens...\n');

// 1. Générer le thème Material 3 à partir de la couleur primaire
const theme = themeFromSourceColor(argbFromHex(BRAND_PRIMARY), [
  {
    name: 'cassis',
    value: argbFromHex(CASSIS_SECONDARY),
    blend: true,
  }
]);

// 2. Extraire les schemes (light & dark)
const lightScheme = theme.schemes.light;
const darkScheme = theme.schemes.dark;

// 3. Helper pour convertir ARGB -> hex
function argbToHex(argb) {
  const hex = (argb & 0x00FFFFFF).toString(16).padStart(6, '0');
  return `#${hex}`;
}

// 4. Calculer les surface containers depuis la palette neutral si non disponibles
function getSurfaceContainers(scheme, palette, isDark = false) {
  // Si le scheme a déjà ces propriétés et qu'elles sont valides, les utiliser
  if (scheme.surfaceContainerLowest && scheme.surfaceContainerLowest !== 0) {
    return {
      lowest: argbToHex(scheme.surfaceContainerLowest),
      low: argbToHex(scheme.surfaceContainerLow),
      container: argbToHex(scheme.surfaceContainer),
      high: argbToHex(scheme.surfaceContainerHigh),
      highest: argbToHex(scheme.surfaceContainerHighest),
    };
  }

  // Sinon, calculer depuis la palette neutral (comme Material 3 officiel)
  if (isDark) {
    return {
      lowest: argbToHex(palette.neutral.tone(4)),
      low: argbToHex(palette.neutral.tone(10)),
      container: argbToHex(palette.neutral.tone(12)),
      high: argbToHex(palette.neutral.tone(17)),
      highest: argbToHex(palette.neutral.tone(22)),
    };
  } else {
    return {
      lowest: argbToHex(palette.neutral.tone(100)),
      low: argbToHex(palette.neutral.tone(96)),
      container: argbToHex(palette.neutral.tone(94)),
      high: argbToHex(palette.neutral.tone(92)),
      highest: argbToHex(palette.neutral.tone(90)),
    };
  }
}

// 5. Générer les tokens CSS
function generateCSSTokens() {
  const lightSurfaceContainers = getSurfaceContainers(lightScheme, theme.palettes, false);
  const darkSurfaceContainers = getSurfaceContainers(darkScheme, theme.palettes, true);

  // Générer tokens expressifs pour dark mode (marketing/landing pages)
  // Utilise des tones très saturés pour gradient punchy
  const expressiveGradients = {
    start: argbToHex(theme.palettes.primary.tone(85)),     // Tone 85 = ultra saturé/punchy
    mid: argbToHex(theme.palettes.secondary.tone(75)),     // Entre primary et tertiary
    end: argbToHex(theme.palettes.tertiary.tone(85)),      // Très saturé
  };

  const expressiveTexts = {
    primary: argbToHex(theme.palettes.neutral.tone(95)),   // Blanc cassé très lisible
    secondary: argbToHex(theme.palettes.neutralVariant.tone(80)), // Beige clair
    tertiary: argbToHex(theme.palettes.neutralVariant.tone(60)),  // Gris moyen
  };

  const expressiveSurfaces = {
    elevated: argbToHex(theme.palettes.neutral.tone(15)),  // Plus clair que surface (tone 10)
    elevatedHover: argbToHex(theme.palettes.neutral.tone(18)), // Hover state
    violetContainer: argbToHex(theme.palettes.primary.tone(10)), // Violet foncé pour alternance visible
    backgroundDark: '#000000',  // Noir pur pour vrai dark mode
  };

  // Bordures avec opacité depuis primary
  const primaryRGB = theme.palettes.primary.tone(85);
  const r = (primaryRGB >> 16) & 0xFF;
  const g = (primaryRGB >> 8) & 0xFF;
  const b = primaryRGB & 0xFF;

  let css = `/**
 * Material 3 Design Tokens - AUTO-GENERATED
 * Source: @material/material-color-utilities
 * Generated from brand color: ${BRAND_PRIMARY}
 */

:root {
  /* === Primary === */
  --md-sys-color-primary: ${argbToHex(lightScheme.primary)};
  --md-sys-color-on-primary: ${argbToHex(lightScheme.onPrimary)};
  --md-sys-color-primary-container: ${argbToHex(lightScheme.primaryContainer)};
  --md-sys-color-on-primary-container: ${argbToHex(lightScheme.onPrimaryContainer)};

  /* === Secondary === */
  --md-sys-color-secondary: ${argbToHex(lightScheme.secondary)};
  --md-sys-color-on-secondary: ${argbToHex(lightScheme.onSecondary)};
  --md-sys-color-secondary-container: ${argbToHex(lightScheme.secondaryContainer)};
  --md-sys-color-on-secondary-container: ${argbToHex(lightScheme.onSecondaryContainer)};

  /* === Tertiary === */
  --md-sys-color-tertiary: ${argbToHex(lightScheme.tertiary)};
  --md-sys-color-on-tertiary: ${argbToHex(lightScheme.onTertiary)};
  --md-sys-color-tertiary-container: ${argbToHex(lightScheme.tertiaryContainer)};
  --md-sys-color-on-tertiary-container: ${argbToHex(lightScheme.onTertiaryContainer)};

  /* === Error === */
  --md-sys-color-error: ${argbToHex(lightScheme.error)};
  --md-sys-color-on-error: ${argbToHex(lightScheme.onError)};
  --md-sys-color-error-container: ${argbToHex(lightScheme.errorContainer)};
  --md-sys-color-on-error-container: ${argbToHex(lightScheme.onErrorContainer)};

  /* === Surface === */
  --md-sys-color-surface: ${argbToHex(lightScheme.surface)};
  --md-sys-color-on-surface: ${argbToHex(lightScheme.onSurface)};
  --md-sys-color-surface-variant: ${argbToHex(lightScheme.surfaceVariant)};
  --md-sys-color-on-surface-variant: ${argbToHex(lightScheme.onSurfaceVariant)};

  /* === Surface Container === */
  --md-sys-color-surface-container-lowest: ${lightSurfaceContainers.lowest};
  --md-sys-color-surface-container-low: ${lightSurfaceContainers.low};
  --md-sys-color-surface-container: ${lightSurfaceContainers.container};
  --md-sys-color-surface-container-high: ${lightSurfaceContainers.high};
  --md-sys-color-surface-container-highest: ${lightSurfaceContainers.highest};

  /* === Outline === */
  --md-sys-color-outline: ${argbToHex(lightScheme.outline)};
  --md-sys-color-outline-variant: ${argbToHex(lightScheme.outlineVariant)};

  /* === Other === */
  --md-sys-color-background: ${argbToHex(lightScheme.background)};
  --md-sys-color-on-background: ${argbToHex(lightScheme.onBackground)};
  --md-sys-color-shadow: ${argbToHex(lightScheme.shadow)};
  --md-sys-color-scrim: ${argbToHex(lightScheme.scrim)};
  --md-sys-color-inverse-surface: ${argbToHex(lightScheme.inverseSurface)};
  --md-sys-color-inverse-on-surface: ${argbToHex(lightScheme.inverseOnSurface)};
  --md-sys-color-inverse-primary: ${argbToHex(lightScheme.inversePrimary)};
}

[data-theme="dark"] {
  /* === Primary === */
  --md-sys-color-primary: ${argbToHex(darkScheme.primary)};
  --md-sys-color-on-primary: ${argbToHex(darkScheme.onPrimary)};
  --md-sys-color-primary-container: ${argbToHex(darkScheme.primaryContainer)};
  --md-sys-color-on-primary-container: ${argbToHex(darkScheme.onPrimaryContainer)};

  /* === Secondary === */
  --md-sys-color-secondary: ${argbToHex(darkScheme.secondary)};
  --md-sys-color-on-secondary: ${argbToHex(darkScheme.onSecondary)};
  --md-sys-color-secondary-container: ${argbToHex(darkScheme.secondaryContainer)};
  --md-sys-color-on-secondary-container: ${argbToHex(darkScheme.onSecondaryContainer)};

  /* === Tertiary === */
  --md-sys-color-tertiary: ${argbToHex(darkScheme.tertiary)};
  --md-sys-color-on-tertiary: ${argbToHex(darkScheme.onTertiary)};
  --md-sys-color-tertiary-container: ${argbToHex(darkScheme.tertiaryContainer)};
  --md-sys-color-on-tertiary-container: ${argbToHex(darkScheme.onTertiaryContainer)};

  /* === Error === */
  --md-sys-color-error: ${argbToHex(darkScheme.error)};
  --md-sys-color-on-error: ${argbToHex(darkScheme.onError)};
  --md-sys-color-error-container: ${argbToHex(darkScheme.errorContainer)};
  --md-sys-color-on-error-container: ${argbToHex(darkScheme.onErrorContainer)};

  /* === Surface === */
  --md-sys-color-surface: ${argbToHex(darkScheme.surface)};
  --md-sys-color-on-surface: ${argbToHex(darkScheme.onSurface)};
  --md-sys-color-surface-variant: ${argbToHex(darkScheme.surfaceVariant)};
  --md-sys-color-on-surface-variant: ${argbToHex(darkScheme.onSurfaceVariant)};

  /* === Surface Container === */
  --md-sys-color-surface-container-lowest: ${darkSurfaceContainers.lowest};
  --md-sys-color-surface-container-low: ${darkSurfaceContainers.low};
  --md-sys-color-surface-container: ${darkSurfaceContainers.container};
  --md-sys-color-surface-container-high: ${darkSurfaceContainers.high};
  --md-sys-color-surface-container-highest: ${darkSurfaceContainers.highest};

  /* === Outline === */
  --md-sys-color-outline: ${argbToHex(darkScheme.outline)};
  --md-sys-color-outline-variant: ${argbToHex(darkScheme.outlineVariant)};

  /* === Other === */
  --md-sys-color-background: ${argbToHex(darkScheme.background)};
  --md-sys-color-on-background: ${argbToHex(darkScheme.onBackground)};
  --md-sys-color-shadow: ${argbToHex(darkScheme.shadow)};
  --md-sys-color-scrim: ${argbToHex(darkScheme.scrim)};
  --md-sys-color-inverse-surface: ${argbToHex(darkScheme.inverseSurface)};
  --md-sys-color-inverse-on-surface: ${argbToHex(darkScheme.inverseOnSurface)};
  --md-sys-color-inverse-primary: ${argbToHex(darkScheme.inversePrimary)};

  /* === EXPRESSIVE TOKENS FOR MARKETING/LANDING PAGES === */
  /* Auto-generated from M3 palettes with higher saturation tones */

  /* Enhanced gradient colors for visual impact (tone 70 = saturated) */
  --casys-gradient-start: ${expressiveGradients.start};
  --casys-gradient-mid: ${expressiveGradients.mid};
  --casys-gradient-end: ${expressiveGradients.end};

  /* Enhanced text colors for better readability (higher tones) */
  --casys-text-primary: ${expressiveTexts.primary};      /* Tone 95 - Very light */
  --casys-text-secondary: ${expressiveTexts.secondary};  /* Tone 80 - Medium light */
  --casys-text-tertiary: ${expressiveTexts.tertiary};    /* Tone 60 - Medium */

  /* Enhanced surfaces for better separation (custom tones) */
  --casys-surface-elevated: ${expressiveSurfaces.elevated};          /* Tone 15 */
  --casys-surface-elevated-hover: ${expressiveSurfaces.elevatedHover}; /* Tone 18 */
  --casys-surface-violet-container: ${expressiveSurfaces.violetContainer}; /* Tone 10 - Violet foncé */
  --casys-background-dark: ${expressiveSurfaces.backgroundDark};     /* Tone 6 */

  /* Enhanced borders with opacity (from primary palette) */
  --casys-border-subtle: rgba(${r}, ${g}, ${b}, 0.08);
  --casys-border-medium: rgba(${r}, ${g}, ${b}, 0.15);
  --casys-border-strong: rgba(${r}, ${g}, ${b}, 0.25);
}

/* ========================================
   UTILITY CLASSES - Marketing/Landing Pages
   ======================================== */

/* Gradient text expressif (pour Hero titles, CTAs) */
[data-theme="dark"] .gradient-text-enhanced {
  background: linear-gradient(135deg,
    var(--casys-gradient-start) 0%,
    var(--casys-gradient-mid) 50%,
    var(--casys-gradient-end) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* Container élevé avec séparation visuelle */
[data-theme="dark"] .surface-elevated {
  background: var(--casys-surface-elevated);
  border: 1px solid var(--casys-border-subtle);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    0 8px 24px rgba(0, 0, 0, 0.2);
}

[data-theme="dark"] .surface-elevated:hover {
  background: var(--casys-surface-elevated-hover);
  border-color: var(--casys-border-medium);
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.3),
    0 16px 32px rgba(0, 0, 0, 0.25);
}

/* Input fields améliorés */
[data-theme="dark"] .input-enhanced {
  background: ${argbToHex(theme.palettes.neutral.tone(8))};
  color: var(--casys-text-primary);
  border: 1px solid var(--casys-border-medium);
}

[data-theme="dark"] .input-enhanced:focus {
  background: ${argbToHex(theme.palettes.neutral.tone(11))};
  border-color: var(--casys-gradient-start);
  box-shadow: 0 0 0 4px rgba(${r}, ${g}, ${b}, 0.15);
}

[data-theme="dark"] .input-enhanced::placeholder {
  color: var(--casys-text-tertiary);
}

/* Cards avec profondeur visuelle */
[data-theme="dark"] .card-elevated {
  background: var(--casys-surface-elevated);
  border: 1px solid var(--casys-border-subtle);
  color: var(--casys-text-secondary);
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.2),
    0 8px 16px rgba(0, 0, 0, 0.15);
}

[data-theme="dark"] .card-elevated:hover {
  background: var(--casys-surface-elevated-hover);
  border-color: var(--casys-border-medium);
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.3),
    0 16px 32px rgba(0, 0, 0, 0.25);
}


/* ========================================
   UTILITY CLASSES - Dark Mode Surfaces
   ======================================== */

/* Hero gradient plein (couleurs saturées) */
[data-theme="dark"] .surface-gradient-hero {
  background: linear-gradient(135deg,
    var(--casys-gradient-start) 0%,    /* #fac2ff */
    var(--casys-gradient-mid) 50%,     /* #c8b2c7 */
    var(--casys-gradient-end) 100%     /* #ffc7c0 */
  );
}

/* Violet container pour alternance visible */
[data-theme="dark"] .surface-violet-container {
  background: var(--casys-surface-violet-container);  /* #350041 */
}

/* Noir pur pour contraste maximum */
[data-theme="dark"] .surface-black {
  background: var(--casys-background-dark);  /* #000000 */
}
`;

  return css;
}

// 5. Générer et sauvegarder
const cssTokens = generateCSSTokens();
const outputPath = join(process.cwd(), 'tokens', 'm3-colors-generated.css');

writeFileSync(outputPath, cssTokens, 'utf-8');

console.log('✅ Material 3 color tokens generated!');
console.log(`📁 Output: ${outputPath}`);
console.log(`\n🎨 Colors generated from:`);
console.log(`   Primary: ${BRAND_PRIMARY}`);
console.log(`   Secondary (Cassis): ${CASSIS_SECONDARY}\n`);
