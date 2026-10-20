import type { ReactNode } from "react";
import { Link, type To } from "react-router-dom";

interface ButtonLinkProps {
  to: To;
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}

const VARIANT_CLASSES: Record<NonNullable<ButtonLinkProps["variant"]>, string> = {
  primary: "bg-maroon text-on-primary hover:bg-maroon-dark shadow-xs hover:shadow-sm",
  secondary: "border border-control-border bg-card text-ink hover:bg-strip shadow-xs hover:shadow-sm",
};

export function ButtonLink({ to, children, onClick, variant = "primary" }: ButtonLinkProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`inline-flex min-h-[44px] items-center justify-center rounded-[10px] px-4 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-safe:transition-[background-color,transform,box-shadow] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] max-sm:flex-1 ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </Link>
  );
}
