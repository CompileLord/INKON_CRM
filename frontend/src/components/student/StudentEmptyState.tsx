import type { ReactNode } from "react";
import { FolderOpen } from "lucide-react";

interface StudentEmptyStateProps {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}

export function StudentEmptyState({ icon, title, body, action }: StudentEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-warm bg-card p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-strip text-muted">
        {icon ?? <FolderOpen size={24} />}
      </div>
      <div className="flex flex-col gap-1 max-w-sm">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <p className="text-xs text-muted leading-relaxed">{body}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
