import { Link, type To } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface ProfileBackLinkProps {
  to: To;
  state?: unknown;
  label: string;
}

export function ProfileBackLink({ to, state, label }: ProfileBackLinkProps) {
  return (
    <Link
      to={to}
      state={state}
      data-page-back
      className="inline-flex min-h-11 w-fit max-w-full items-center gap-2 text-sm font-medium text-nav hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
    >
      <ArrowLeft size={16} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 break-words">{label}</span>
    </Link>
  );
}
