# Tech Spec: Migration MCP Apps UI vers Preact + Tailwind

## Métadonnées

| Champ | Valeur |
|-------|--------|
| **Épic** | MCP Apps lib/std UI |
| **Phase** | 8 - Migration Stack |
| **Priorité** | Haute |
| **Estimation** | 3-4 jours |
| **Risque** | Moyen |

## Résumé

Migration du stack UI des MCP Apps de **React + Panda CSS + Ark UI (Park UI)** vers **Preact + Tailwind CSS + Headless UI** pour réduire la taille des bundles de ~205 kB à ~70 kB gzip tout en conservant la même DX et les fonctionnalités MCP Apps.

## Contexte

### Stack actuel

```
React 18 + ReactDOM     ~40 kB gzip
Panda CSS (runtime)     ~50 kB gzip
Ark UI (Park UI)        ~80 kB gzip
Code applicatif         ~35 kB gzip
─────────────────────────────────────
Total                   ~205 kB gzip
```

### Problèmes identifiés

1. **Taille excessive** : 205 kB pour des widgets embarqués dans un chat
2. **Ark UI portals** : Nécessite `portalled={false}` partout (iframes sandboxées)
3. **Panda CSS** : Complexité des recipes pour des UIs simples
4. **Overkill** : Stack conçu pour des apps complexes, pas des widgets

### Stack cible

```
Preact + preact/compat   ~4 kB gzip
Tailwind CSS (purged)   ~10 kB gzip
Headless UI             ~15 kB gzip
Code applicatif         ~35 kB gzip
─────────────────────────────────────
Total                   ~65-75 kB gzip
```

**Réduction : ~65%**

## Objectifs

### Objectifs principaux

1. Réduire la taille des bundles de 65%
2. Maintenir la parité fonctionnelle avec les UIs existantes
3. Conserver la même DX (hooks, JSX, composants)
4. Améliorer le temps de chargement initial

### Non-objectifs

- Réécrire la logique métier des composants
- Changer l'architecture MCP Apps
- Supporter d'autres frameworks (Vue, Svelte)

## Spécification technique

### 1. Structure des dossiers (après migration)

```
lib/std/src/ui/
├── tailwind.config.js          # Config Tailwind
├── postcss.config.js           # PostCSS pour Tailwind
├── global.css                  # @tailwind base/components/utilities
├── components/
│   ├── ui/                     # Headless UI wrappers
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── menu.tsx
│   │   ├── tooltip.tsx         # Custom (Headless UI n'en a pas)
│   │   ├── table.tsx           # Custom
│   │   ├── alert.tsx           # Custom
│   │   ├── skeleton.tsx        # Custom
│   │   ├── progress.tsx        # Custom
│   │   └── index.ts
│   └── shared/                 # Utilitaires partagés
│       ├── StatusBadge.tsx
│       ├── LoadingSkeleton.tsx
│       └── index.ts
├── gauge/
│   └── src/main.tsx
├── table-viewer/
│   └── src/main.tsx
├── chart-viewer/
│   └── src/main.tsx
└── ... (autres UIs)
```

### 2. Configuration Preact

#### vite.config.ts (mise à jour)

```typescript
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [preact(), viteSingleFile()],
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  esbuild: {
    jsxFactory: "h",
    jsxFragment: "Fragment",
  },
  resolve: {
    alias: {
      "react": "preact/compat",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime",
    },
  },
});
```

#### package.json (dépendances)

```json
{
  "dependencies": {
    "preact": "^10.19.0",
    "@headlessui/react": "^2.1.0",
    "@modelcontextprotocol/ext-apps": "^0.1.0"
  },
  "devDependencies": {
    "@preact/preset-vite": "^2.8.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "vite": "^5.0.0",
    "vite-plugin-singlefile": "^2.0.0",
    "typescript": "^5.3.0"
  }
}
```

### 3. Configuration Tailwind

#### tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./**/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class", // Support dark mode via classe sur <html>
  theme: {
    extend: {
      colors: {
        // Tokens sémantiques pour MCP Apps
        fg: {
          default: "var(--fg-default, #1a1a1a)",
          muted: "var(--fg-muted, #6b7280)",
        },
        bg: {
          canvas: "var(--bg-canvas, #ffffff)",
          subtle: "var(--bg-subtle, #f9fafb)",
          muted: "var(--bg-muted, #f3f4f6)",
        },
        border: {
          default: "var(--border-default, #e5e7eb)",
          subtle: "var(--border-subtle, #f3f4f6)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      animation: {
        "pulse-subtle": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "skeleton-shine": "shine 1.5s ease-in-out infinite",
      },
      keyframes: {
        shine: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
```

#### global.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* CSS Variables pour theming */
:root {
  --fg-default: #1a1a1a;
  --fg-muted: #6b7280;
  --bg-canvas: #ffffff;
  --bg-subtle: #f9fafb;
  --bg-muted: #f3f4f6;
  --border-default: #e5e7eb;
  --border-subtle: #f3f4f6;
}

.dark {
  --fg-default: #f9fafb;
  --fg-muted: #9ca3af;
  --bg-canvas: #111827;
  --bg-subtle: #1f2937;
  --bg-muted: #374151;
  --border-default: #374151;
  --border-subtle: #1f2937;
}

/* Utilitaires communs */
@layer utilities {
  .transition-value {
    @apply transition-all duration-300 ease-out;
  }
}
```

### 4. Composants UI personnalisés

#### components/ui/skeleton.tsx

```tsx
import { ComponentChildren } from "preact";
import { cx } from "../utils";

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
  circle?: boolean;
}

export function Skeleton({ className, width, height, circle }: SkeletonProps) {
  return (
    <div
      className={cx(
        "animate-pulse bg-gray-200 dark:bg-gray-700",
        circle ? "rounded-full" : "rounded",
        className
      )}
      style={{ width, height }}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="16px"
          width={i === lines - 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}
```

#### components/ui/tooltip.tsx

```tsx
import { ComponentChildren } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";

interface TooltipProps {
  content: string;
  children: ComponentChildren;
  position?: "top" | "bottom" | "left" | "right";
}

export function Tooltip({ content, children, position = "top" }: TooltipProps) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div
      ref={ref}
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          role="tooltip"
          className={cx(
            "absolute z-50 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded shadow-lg",
            "dark:bg-gray-100 dark:text-gray-900",
            "whitespace-nowrap pointer-events-none",
            positionClasses[position]
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
```

#### components/ui/alert.tsx

```tsx
import { ComponentChildren } from "preact";
import { cx } from "../utils";

type AlertStatus = "info" | "success" | "warning" | "error";

interface AlertProps {
  status: AlertStatus;
  title?: string;
  children: ComponentChildren;
  className?: string;
}

const statusStyles: Record<AlertStatus, string> = {
  info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-200",
  success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-200",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-200",
  error: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-200",
};

const icons: Record<AlertStatus, string> = {
  info: "ℹ️",
  success: "✓",
  warning: "⚠",
  error: "✕",
};

export function Alert({ status, title, children, className }: AlertProps) {
  return (
    <div
      role="alert"
      className={cx(
        "flex gap-3 p-4 border rounded-lg",
        statusStyles[status],
        className
      )}
    >
      <span className="flex-shrink-0 text-lg">{icons[status]}</span>
      <div>
        {title && <div className="font-semibold">{title}</div>}
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}
```

#### components/ui/button.tsx

```tsx
import { ComponentChildren } from "preact";
import { cx } from "../utils";

interface ButtonProps {
  variant?: "solid" | "outline" | "ghost";
  size?: "xs" | "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children: ComponentChildren;
}

const variants = {
  solid: "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800",
  outline: "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800",
  ghost: "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800",
};

const sizes = {
  xs: "px-2 py-1 text-xs",
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export function Button({
  variant = "solid",
  size = "md",
  disabled,
  onClick,
  className,
  children,
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center font-medium rounded-md",
        "transition-all duration-150 ease-in-out",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "hover:scale-[1.02] active:scale-[0.98]",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  );
}
```

#### components/utils.ts

```typescript
// Utility pour combiner les classes (comme clsx/cx)
export function cx(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// Utility pour formater les valeurs
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Utility pour formater les nombres
export function formatNumber(value: number, unit?: string): string {
  let formatted: string;
  if (value >= 1_000_000_000) {
    formatted = (value / 1_000_000_000).toFixed(1) + "G";
  } else if (value >= 1_000_000) {
    formatted = (value / 1_000_000).toFixed(1) + "M";
  } else if (value >= 1_000) {
    formatted = (value / 1_000).toFixed(1) + "K";
  } else if (Number.isInteger(value)) {
    formatted = String(value);
  } else {
    formatted = value.toFixed(1);
  }
  return unit ? `${formatted}${unit}` : formatted;
}
```

### 5. Migration d'un composant exemple

#### Avant (React + Panda CSS + Ark UI)

```tsx
import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { css, cx } from "../../styled-system/css";
import { Box, Flex } from "../../styled-system/jsx";
import { Tooltip } from "../../components/ui/tooltip";
import * as Alert from "../../components/ui/alert";
import { TableSkeleton, containers, typography } from "../../shared";

function TableViewer() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  if (loading) return <TableSkeleton rows={8} />;

  return (
    <Box className={containers.root}>
      <Box className={typography.sectionTitle}>Data</Box>
      {/* ... */}
    </Box>
  );
}

createRoot(document.getElementById("app")!).render(<TableViewer />);
```

#### Après (Preact + Tailwind)

```tsx
import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { Tooltip, Alert, Skeleton, SkeletonText } from "../../components/ui";
import { cx } from "../../components/utils";
import "../../global.css";

const app = new App({ name: "Table Viewer", version: "1.0.0" });

function TableSkeleton({ rows = 5 }) {
  return (
    <div className="p-4 font-sans text-sm">
      <div className="flex gap-3 mb-3">
        <Skeleton height="36px" width="200px" />
        <Skeleton height="36px" width="100px" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 p-2">
            <Skeleton height="20px" width="80px" />
            <Skeleton height="20px" width="120px" />
            <Skeleton height="20px" width="100px" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableViewer() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().catch(() => {});
    app.ontoolresult = (result) => {
      setLoading(false);
      // ... parse data
    };
  }, []);

  if (loading) return <TableSkeleton rows={8} />;

  return (
    <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas">
      <h2 className="text-lg font-semibold mb-4">Data</h2>
      {/* ... */}
    </div>
  );
}

render(<TableViewer />, document.getElementById("app")!);
```

### 6. Classes Tailwind équivalentes aux styles partagés

| Panda CSS (actuel) | Tailwind (nouveau) |
|--------------------|-------------------|
| `containers.root` | `p-4 font-sans text-sm text-fg-default bg-bg-canvas` |
| `containers.centered` | `flex items-center justify-center p-8 text-fg-muted` |
| `typography.sectionTitle` | `text-lg font-semibold` |
| `typography.label` | `text-xs font-medium uppercase tracking-wide text-fg-muted` |
| `typography.value` | `text-xl font-bold font-mono` |
| `typography.muted` | `text-sm text-fg-muted` |
| `interactive.scaleOnHover` | `transition-transform duration-150 hover:scale-[1.02]` |
| `interactive.focusRing` | `focus:outline-none focus:ring-2 focus:ring-blue-500/30` |
| `interactive.rowHover` | `transition-colors duration-150 hover:bg-bg-subtle` |
| `valueTransition` | `transition-all duration-300 ease-out` |

## Plan de migration

### Phase 1 : Infrastructure (1 jour)

1. [ ] Créer nouvelle config Vite avec Preact
2. [ ] Configurer Tailwind CSS
3. [ ] Créer `global.css` avec tokens CSS
4. [ ] Créer composants UI de base (Button, Alert, Skeleton, Tooltip)
5. [ ] Créer utilitaires (`cx`, `formatValue`, etc.)

### Phase 2 : Migrer composants simples (1 jour)

1. [ ] `gauge/` - SVG simple, peu de dépendances UI
2. [ ] `metrics-panel/` - Grille de métriques
3. [ ] `validation-result/` - Liste d'erreurs

### Phase 3 : Migrer composants complexes (1 jour)

1. [ ] `table-viewer/` - Sorting, pagination, filtering
2. [ ] `chart-viewer/` - SVG charts avec tooltips
3. [ ] `json-viewer/` - Tree view récursif

### Phase 4 : Validation et optimisation (0.5 jour)

1. [ ] Vérifier tous les builds
2. [ ] Tester dark mode
3. [ ] Tester accessibilité (keyboard nav, ARIA)
4. [ ] Mesurer les tailles finales
5. [ ] Mettre à jour la documentation

### Phase 5 : Cleanup (0.5 jour)

1. [ ] Supprimer Panda CSS et Ark UI
2. [ ] Supprimer `styled-system/` généré
3. [ ] Mettre à jour `package.json`
4. [ ] Archiver l'ancienne config

## Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Incompatibilité Preact/compat | Faible | Moyen | Headless UI testé avec Preact, éviter Radix |
| Régression visuelle | Moyen | Faible | Screenshots avant/après pour comparaison |
| Perte de fonctionnalité | Faible | Élevé | Tests manuels de chaque UI |
| Dark mode cassé | Moyen | Faible | Variables CSS + classe `.dark` |

## Métriques de succès

| Métrique | Avant | Cible | Méthode de mesure |
|----------|-------|-------|-------------------|
| Bundle gzip | 205 kB | < 80 kB | `vite build` output |
| Temps premier rendu | ~300ms | < 100ms | Chrome DevTools |
| Accessibilité | Partielle | Complète | axe-core audit |
| Nombre de dépendances | 15+ | < 8 | `npm ls --depth=0` |

## Dépendances finales

```json
{
  "dependencies": {
    "preact": "^10.19.0",
    "@headlessui/react": "^2.1.0",
    "@modelcontextprotocol/ext-apps": "^0.1.0"
  },
  "devDependencies": {
    "@preact/preset-vite": "^2.8.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "vite": "^5.0.0",
    "vite-plugin-singlefile": "^2.0.0",
    "typescript": "^5.3.0"
  }
}
```

## Références

- [Preact Documentation](https://preactjs.com/guide/v10/getting-started)
- [Preact/compat](https://preactjs.com/guide/v10/switching-to-preact)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Headless UI](https://headlessui.com/)
- [MCP Apps SDK](https://github.com/modelcontextprotocol/ext-apps)
- [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile)
