import { JSX } from "preact";
import { cx } from "../utils";

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl" | "inherit";

export interface SpinnerProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  color?: string;
  borderWidth?: string;
  speed?: string;
  label?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
  xl: "w-12 h-12",
  inherit: "w-[1em] h-[1em]",
};

export function Spinner({
  size = "md",
  color,
  borderWidth = "2px",
  speed = "0.65s",
  label = "Loading...",
  className,
  style,
  ...rest
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cx(
        "inline-block rounded-full border-solid border-current animate-spin",
        "border-t-transparent border-r-transparent",
        sizeStyles[size],
        className
      )}
      style={{
        borderWidth,
        animationDuration: speed,
        color: color || "currentColor",
        ...style,
      }}
      {...rest}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}

export type SpinnerProps_Alias = SpinnerProps;
