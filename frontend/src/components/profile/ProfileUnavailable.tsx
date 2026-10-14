import type { ReactNode } from "react";
import { AlertCircle, Lock, SearchX } from "lucide-react";
import { AuthApiError } from "../../lib/auth/errors";
import { Button } from "../ui/Button";

export type ProfileUnavailableKind = "forbidden" | "notFound" | "failed";

export function classifyProfileFailure(error: unknown): ProfileUnavailableKind {
  if (error instanceof AuthApiError) {
    if (error.status === 401 || error.status === 403) return "forbidden";
    if (error.status >= 400 && error.status <= 499) return "notFound";
  }
  return "failed";
}

export interface ProfileUnavailableProps {
  kind: ProfileUnavailableKind;
  title: string;
  description: string;
  returnLink: ReactNode;
  retryLabel: string;
  onRetry: () => void;
}

const kindIcons = { forbidden: Lock, notFound: SearchX, failed: AlertCircle } as const;

export function ProfileUnavailable({ kind, title, description, returnLink, retryLabel, onRetry }: ProfileUnavailableProps) {
  const Icon = kindIcons[kind];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {returnLink}
      <div
        role={kind === "failed" ? "alert" : "status"}
        data-profile-state={kind}
        className="flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-border bg-card p-6 text-center"
      >
        <Icon size={28} aria-hidden="true" className="text-muted" />
        <h1 className="text-lg font-semibold text-ink [overflow-wrap:anywhere]">{title}</h1>
        <p className="max-w-prose text-sm text-muted [overflow-wrap:anywhere]">{description}</p>
        {kind === "failed" && (
          <Button variant="secondary" onClick={onRetry} className="mt-2 min-h-11">
            {retryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
