import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "accent" | "destructive";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-maroon text-white hover:bg-maroon-dark shadow-xs hover:shadow-sm",
  secondary: "bg-card text-ink border border-border-warm hover:bg-strip shadow-xs hover:shadow-sm",
  accent: "bg-accent text-white hover:bg-accent-dark shadow-xs hover:shadow-sm",
  destructive: "bg-red-600 text-white hover:bg-red-700 shadow-xs hover:shadow-sm",
};

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-[background-color,transform,box-shadow,border-color] duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      )}
      {children}
    </button>
  );
}
