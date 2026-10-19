import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div data-empty-state className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-base font-medium text-ink">{title}</p>
      {description !== undefined && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  );
}
