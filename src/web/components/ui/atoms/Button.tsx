/**
 * Button Atom - Reusable button with variants
 * Variants: default, primary, ghost, danger
 */

import type { ComponentChildren, JSX } from "preact";

export type ButtonVariant = "default" | "primary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  children: ComponentChildren;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  class?: string;
  type?: "button" | "submit" | "reset";
}

interface VariantStyle {
  base: string;
  hover: string;
}

const VARIANT_STYLES: Record<ButtonVariant, VariantStyle> = {
  default: {
    base:
      "background: var(--accent-dim); border: 1px solid var(--border-strong); color: var(--text-muted);",
    hover: "background: var(--accent-medium); border-color: var(--accent); color: var(--accent);",
  },
  primary: {
    base: "background: var(--accent); border: 1px solid var(--accent); color: var(--bg);",
    hover: "filter: brightness(1.1);",
  },
  ghost: {
    base: "background: transparent; border: 1px solid transparent; color: var(--text-muted);",
    hover: "background: var(--accent-dim); color: var(--text);",
  },
  danger: {
    base:
      "background: rgba(248, 113, 113, 0.1); border: 1px solid rgba(248, 113, 113, 0.2); color: var(--error);",
    hover: "background: rgba(248, 113, 113, 0.2); border-color: var(--error);",
  },
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "py-1.5 px-3 text-xs",
  md: "py-2 px-4 text-sm",
  lg: "py-3 px-5 text-base",
};

/**
 * Converts a CSS property string like "border-color" to camelCase "borderColor"
 */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Applies CSS styles from a semicolon-separated string to an element
 */
function applyStyleString(element: HTMLElement, styleStr: string): void {
  const parts = styleStr.split(";").filter(Boolean);
  for (const part of parts) {
    const colonIndex = part.indexOf(":");
    if (colonIndex === -1) continue;

    const prop = part.slice(0, colonIndex).trim();
    const val = part.slice(colonIndex + 1).trim();
    if (prop && val) {
      // deno-lint-ignore no-explicit-any
      (element.style as any)[toCamelCase(prop)] = val;
    }
  }
}

export default function Button({
  children,
  variant = "default",
  size = "md",
  onClick,
  disabled,
  title,
  class: className,
  type = "button",
}: ButtonProps): JSX.Element {
  const styles = VARIANT_STYLES[variant];

  function handleMouseOver(e: MouseEvent): void {
    if (!disabled) {
      applyStyleString(e.currentTarget as HTMLElement, styles.hover);
    }
  }

  function handleMouseOut(e: MouseEvent): void {
    if (!disabled) {
      applyStyleString(e.currentTarget as HTMLElement, styles.base);
    }
  }

  const baseClasses = `rounded-lg font-medium cursor-pointer transition-all duration-200 ${SIZE_CLASSES[size]}`;
  const combinedClasses = `${baseClasses} ${className || ""}`.trim();

  return (
    <button
      type={type}
      class={combinedClasses}
      style={styles.base}
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      {children}
    </button>
  );
}
