import type { ButtonHTMLAttributes, Ref } from "react";
import { BrandActivityIndicator } from "./BrandActivityIndicator";

export type ButtonVariant = "primary" | "secondary" | "accent" | "destructive";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  variant?: ButtonVariant;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-maroon text-on-primary hover:bg-maroon-dark shadow-xs hover:shadow-sm",
  secondary:
    "bg-card text-ink border border-control-border hover:bg-strip shadow-xs hover:shadow-sm",
  accent:
    "bg-accent text-on-accent hover:bg-accent-dark shadow-xs hover:shadow-sm",
  destructive:
    "bg-destructive text-on-destructive hover:opacity-90 shadow-xs hover:shadow-sm",
};

export function Button({
  variant = "primary",
  loading,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const supportsLoading = loading !== undefined;
  const isLoading = Boolean(loading);
  const isDisabled = disabled || isLoading;

  return (
    <button
      disabled={isDisabled}
      aria-busy={isLoading ? "true" : undefined}
      className={[
        "relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-medium",
        "touch-manipulation select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        "motion-safe:transition-[background-color,transform,box-shadow,border-color,opacity] motion-safe:duration-150 motion-safe:ease-out",
        "motion-safe:active:scale-[0.96]",
        "focus-visible:active:scale-100 focus-visible:transition-none",
        "disabled:cursor-not-allowed disabled:bg-beige disabled:text-muted disabled:border-control-border disabled:shadow-none disabled:active:scale-100 disabled:pointer-events-none",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {supportsLoading ? (
        <>
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center shrink-0 w-[23px] h-4"
          >
            {isLoading ? (
              <BrandActivityIndicator size={16} aria-hidden="true" />
            ) : null}
          </span>
          <span className="inline-flex items-center justify-center gap-2">{children}</span>
          <span
            aria-hidden="true"
            className="inline-flex shrink-0 w-[23px] h-4 invisible pointer-events-none select-none"
          />
        </>
      ) : (
        children
      )}
    </button>
  );
}
