import type { ReactNode } from "react";
import { Menu, type MenuItem } from "./Menu";

interface EntityHeaderProps {
  avatar: ReactNode;
  name: string;
  status?: ReactNode;
  meta?: readonly string[];
  primaryAction?: ReactNode;
  menuItems?: readonly MenuItem[];
  menuLabel?: string;
}

export function EntityHeader({ avatar, name, status, meta = [], primaryAction, menuItems, menuLabel }: EntityHeaderProps) {
  return (
    <div data-entity-header className="flex flex-wrap items-center gap-x-4 gap-y-3">
      {avatar}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="min-w-0 break-words text-2xl font-semibold leading-8 text-ink">{name}</h1>
          {status}
        </div>
        {meta.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {meta.map((item, index) => (
              <span key={`${index}-${item}`} className="flex items-center gap-2">
                {index > 0 && <span aria-hidden="true">·</span>}
                <span>{item}</span>
              </span>
            ))}
          </p>
        )}
      </div>
      {(primaryAction !== undefined || (menuItems !== undefined && menuItems.length > 0)) && (
        <div className="flex shrink-0 items-center gap-2 max-sm:w-full">
          {primaryAction}
          {menuItems !== undefined && menuItems.length > 0 && <Menu items={menuItems} label={menuLabel} />}
        </div>
      )}
    </div>
  );
}
