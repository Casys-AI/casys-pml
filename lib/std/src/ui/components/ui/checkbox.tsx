import { ComponentChildren, JSX } from "preact";
import { useState, useCallback } from "preact/hooks";
import { cx } from "../utils";

export type CheckedState = boolean | "indeterminate";

export interface CheckboxProps extends Omit<JSX.HTMLAttributes<HTMLInputElement>, "onChange" | "size"> {
  checked?: CheckedState;
  defaultChecked?: boolean;
  onChange?: (checked: CheckedState) => void;
  size?: "sm" | "md" | "lg";
  isDisabled?: boolean;
  isInvalid?: boolean;
  children?: ComponentChildren;
}

const sizeStyles = {
  sm: { box: "w-4 h-4", icon: "w-2.5 h-2.5", label: "text-sm" },
  md: { box: "w-5 h-5", icon: "w-3 h-3", label: "text-sm" },
  lg: { box: "w-6 h-6", icon: "w-4 h-4", label: "text-base" },
};

export function Checkbox({
  checked: controlledChecked,
  defaultChecked = false,
  onChange,
  size = "md",
  isDisabled,
  isInvalid,
  disabled,
  children,
  className,
  id,
  ...rest
}: CheckboxProps) {
  const [internalChecked, setInternalChecked] = useState<CheckedState>(defaultChecked);
  const isControlled = controlledChecked !== undefined;
  const checkedState = isControlled ? controlledChecked : internalChecked;
  const isChecked = checkedState === true;
  const isIndeterminate = checkedState === "indeterminate";
  const actualDisabled = isDisabled ?? disabled;

  const handleChange = useCallback(() => {
    if (actualDisabled) return;
    const newChecked = !isChecked;
    if (!isControlled) {
      setInternalChecked(newChecked);
    }
    onChange?.(newChecked);
  }, [isChecked, isControlled, onChange, actualDisabled]);

  const styles = sizeStyles[size];
  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <label
      className={cx(
        "inline-flex items-center gap-2 cursor-pointer select-none",
        actualDisabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <span className="relative inline-flex items-center justify-center">
        <input
          type="checkbox"
          id={checkboxId}
          checked={isChecked}
          disabled={actualDisabled}
          onChange={handleChange}
          className="sr-only peer"
          {...rest}
        />
        <span
          className={cx(
            styles.box,
            "rounded border-2 transition-colors duration-150",
            "flex items-center justify-center",
            isChecked || isIndeterminate
              ? "bg-blue-600 border-blue-600"
              : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600",
            !actualDisabled && "hover:border-blue-500",
            isInvalid && "border-red-500",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2"
          )}
        >
          {(isChecked || isIndeterminate) && (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cx(styles.icon, "text-white")}
            >
              <title>Checkmark</title>
              {isIndeterminate ? (
                <path d="M5 12h14" />
              ) : (
                <path d="M20 6 9 17l-5-5" />
              )}
            </svg>
          )}
        </span>
      </span>
      {children && (
        <span className={cx(styles.label, "text-gray-900 dark:text-white")}>
          {children}
        </span>
      )}
    </label>
  );
}

// Sub-components for compound component API compatibility
export interface CheckboxRootProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Root({ children, className, ...rest }: CheckboxRootProps) {
  return (
    <div className={cx("inline-flex items-center gap-2", className)} {...rest}>
      {children}
    </div>
  );
}

export interface CheckboxControlProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  checked?: boolean;
  disabled?: boolean;
}

export function Control({ checked, disabled, className, ...rest }: CheckboxControlProps) {
  return (
    <span
      className={cx(
        "w-5 h-5 rounded border-2 transition-colors duration-150",
        "flex items-center justify-center",
        checked
          ? "bg-blue-600 border-blue-600"
          : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600",
        !disabled && "hover:border-blue-500",
        className
      )}
      {...rest}
    />
  );
}

export interface CheckboxLabelProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children: ComponentChildren;
}

export function Label({ children, className, ...rest }: CheckboxLabelProps) {
  return (
    <span className={cx("text-sm text-gray-900 dark:text-white", className)} {...rest}>
      {children}
    </span>
  );
}

export interface CheckboxGroupProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Group({ children, className, ...rest }: CheckboxGroupProps) {
  return (
    <div className={cx("flex flex-col gap-2", className)} role="group" {...rest}>
      {children}
    </div>
  );
}

export function HiddenInput(props: JSX.HTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className="sr-only" {...props} />;
}

export function Indicator({ checked, indeterminate, className }: { checked?: boolean; indeterminate?: boolean; className?: string }) {
  if (!checked && !indeterminate) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("w-3 h-3 text-white", className)}
    >
      <title>Checkmark</title>
      {indeterminate ? <path d="M5 12h14" /> : <path d="M20 6 9 17l-5-5" />}
    </svg>
  );
}

export type RootProps = CheckboxRootProps;
export type HiddenInputProps = JSX.HTMLAttributes<HTMLInputElement>;
