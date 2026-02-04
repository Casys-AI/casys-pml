/**
 * Badge - Atomic component for status/type indicators
 * @module web/components/atoms/Badge
 */

import type { ComponentChildren } from "preact";

interface BadgeProps {
  children: ComponentChildren;
  variant?: "default" | "success" | "warning" | "error" | "info";
  size?: "sm" | "md";
  class?: string;
}

const sizeClasses = {
  sm: "text-[0.6875rem] px-1.5 py-0.5",
  md: "text-xs px-2 py-1",
};

const variantClasses = {
  default: "bg-amber-500/10 text-amber-400",
  success: "bg-green-400/10 text-green-400",
  warning: "bg-yellow-400/10 text-yellow-400",
  error: "bg-red-400/15 text-red-400",
  info: "bg-blue-400/10 text-blue-400",
};

export default function Badge({
  children,
  variant = "default",
  size = "sm",
  class: className,
}: BadgeProps) {
  return (
    <span
      class={`inline-flex items-center font-medium rounded whitespace-nowrap ${sizeClasses[size]} ${variantClasses[variant]} ${className || ""}`}
    >
      {children}
    </span>
  );
}
