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

const sizeClasses: Record<ButtonSize, string> = {
  sm: "py-1.5 px-3 text-xs",
  md: "py-2 px-4 text-sm",
  lg: "py-3 px-5 text-base",
};

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-amber-500/10 border border-stone-600 text-stone-400 hover:bg-amber-500/20 hover:border-amber-500 hover:text-amber-500",
  primary:
    "bg-amber-500 border border-amber-500 text-stone-900 hover:brightness-110",
  ghost:
    "bg-transparent border border-transparent text-stone-400 hover:bg-amber-500/10 hover:text-stone-200",
  danger:
    "bg-red-400/10 border border-red-400/20 text-red-400 hover:bg-red-400/20 hover:border-red-400",
};

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
  return (
    <button
      type={type}
      class={`
        rounded-lg font-medium cursor-pointer transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className || ""}
      `}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}
