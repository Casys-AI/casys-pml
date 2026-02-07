# Material 3 Expressive Design System

Design system officiel de CASYS basé sur Material Design 3 Expressive.

## Architecture

```
packages/design-system/
├── tokens/                    # Sources JSON Material 3 (242 tokens)
│   ├── color.json
│   ├── typography.json
│   ├── shape.json
│   ├── motion.json
│   ├── elevation.json
│   ├── state.json
│   ├── components/            # 29 composants M3 officiels
│   │   ├── filled-button.json
│   │   ├── elevated-card.json
│   │   └── ...
│   └── themes/
│       ├── light.json
│       └── dark.json
│
├── css/                       # CSS sources organisées
│   ├── base/
│   │   └── reset.css         # Reset minimaliste M3
│   ├── utilities/            # 7 fichiers utilities
│   │   ├── colors.css        # Text & background colors
│   │   ├── typography.css    # Typescale utilities
│   │   ├── spacing.css       # Padding, margin, gap
│   │   ├── layout.css        # Display, flexbox, grid
│   │   ├── shapes.css        # Border radius
│   │   ├── elevation.css     # Box shadows
│   │   └── effects.css       # Transitions, gradients
│   └── components.css        # Component patterns (buttons, cards, badges)
│
├── build.js                  # Build script (génère dist/)
│
└── dist/                     # Outputs générés (git ignored)
    ├── tokens.css            # Vars CSS M3 (light + dark)
    ├── tokens.scss           # Vars SCSS (Angular)
    ├── tokens.js             # Module ES6
    ├── tokens.d.ts           # TypeScript types
    ├── utilities.css         # Bundle des 7 utilities
    ├── components.css        # Components CSS
    └── m3.css                # BUNDLE COMPLET (tout en un)
```

## Utilisation

### Astro (casys-app)

```css
/* src/styles.css */
@import '@casys/design-system/m3.css';
```

```astro
<!-- Utilities + Material Web Components -->
<div class="flex items-center gap-4 bg-surface p-6 rounded-lg">
  <h1 class="text-display-lg gradient-text">Hello</h1>
  <md-filled-button>Click me</md-filled-button>
</div>
```

### Angular (dashboard)

```css
/* src/styles.css */
@import '@casys/design-system/m3.css';
```

```html
<!-- Utilities + Angular Material -->
<div class="flex items-center gap-4 bg-surface p-6 rounded-lg">
  <h1 class="text-display-lg gradient-text">Dashboard</h1>
  <button mat-raised-button color="primary">Action</button>
</div>
```

## Tokens M3 disponibles

### Colors
```css
--md-sys-color-primary
--md-sys-color-on-primary
--md-sys-color-secondary
--md-sys-color-tertiary
--md-sys-color-surface
--md-sys-color-surface-container
--md-sys-color-error
...
```

### Typography
```css
--md-sys-typescale-display-large-size
--md-sys-typescale-headline-medium-size
--md-sys-typescale-body-large-size
--md-sys-typescale-label-medium-size
...
```

### Shapes
```css
--md-sys-shape-corner-small
--md-sys-shape-corner-medium
--md-sys-shape-corner-large
--md-sys-shape-corner-full
...
```

### Elevation
```css
--md-sys-elevation-level0
--md-sys-elevation-level1
--md-sys-elevation-level2
...
```

### Motion
```css
--md-sys-motion-easing-standard
--md-sys-motion-easing-emphasized
...
```

## Utility Classes (style Tailwind)

### Typography
`.text-display-lg` `.text-headline-md` `.text-body-sm` `.text-label-lg`

### Colors
`.text-primary` `.text-on-surface` `.bg-surface` `.bg-primary-container`

### Spacing
`.p-4` `.px-6` `.py-2` `.gap-4` `.m-0` `.mx-auto`

### Layout
`.flex` `.flex-col` `.grid` `.items-center` `.justify-between` `.gap-4`

### Shapes
`.rounded-sm` `.rounded-md` `.rounded-full`

### Elevation
`.elevation-1` `.elevation-2`

### Effects
`.transition-standard` `.gradient-text` `.gradient-bg-primary-tertiary`

## Build

```bash
pnpm build
```

Génère tous les fichiers dans `dist/` :
- ✅ CSS tokens + utilities + components
- ✅ SCSS variables (Angular)
- ✅ JavaScript + TypeScript

## Stack

- **Material Design 3 Expressive** (242 tokens officiels)
- **29 composants M3** (specs JSON)
- **Utility-first approach** (comme Tailwind)
- **Partagé** entre Astro & Angular

## Personnalisation

Les tokens peuvent être overridés via CSS custom properties :

```css
:root {
  --md-sys-color-primary: #your-color;
  --md-sys-typescale-display-large-size: 64px;
}
```
