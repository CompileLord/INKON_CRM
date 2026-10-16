import type { ReactNode } from "react";

interface CourseStatTileProps {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: ReactNode;
  testId: string;
  toneClass?: string;
}

export function CourseStatTile({ icon, label, value, hint, testId, toneClass = "text-ink" }: CourseStatTileProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border-warm bg-card p-4" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span aria-hidden="true" className="text-maroon dark:text-accent">{icon}</span>
        <span className="min-w-0 truncate">{label}</span>
        {hint}
      </div>
      <p className={`text-2xl font-semibold leading-8 tabular-nums ${toneClass}`} data-testid={`${testId}-value`}>
        {value}
      </p>
    </div>
  );
}
