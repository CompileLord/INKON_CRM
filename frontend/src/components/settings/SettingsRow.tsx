import type { ReactNode } from "react";

interface SettingsRowProps {
  icon?: ReactNode;
  label: string;
  description?: string;
  hint?: ReactNode;
  children: ReactNode;
  controlId?: string;
}

export function SettingsRow({ icon, label, description, hint, children, controlId }: SettingsRowProps) {
  return (
    <div className="grid gap-3 py-4 @[34rem]:grid-cols-[minmax(10rem,1fr)_minmax(0,20rem)] @[34rem]:items-center @[34rem]:gap-6 @[48rem]:grid-cols-[minmax(10rem,1fr)_minmax(0,24rem)]">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <span aria-hidden="true" className="mt-0.5 shrink-0 text-muted">{icon}</span>}
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-sm font-medium text-ink">
            <label htmlFor={controlId} className="break-words">{label}</label>
            {hint}
          </div>
          {description && <p className="mt-0.5 break-words text-sm text-muted">{description}</p>}
        </div>
      </div>
      <div className="min-w-0 @[34rem]:justify-self-end @[34rem]:w-full">{children}</div>
    </div>
  );
}

export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="@container rounded-[14px] border border-border bg-card px-4 sm:px-6">
      {title && <h3 className="border-b border-border py-3 text-sm font-semibold text-ink">{title}</h3>}
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}
