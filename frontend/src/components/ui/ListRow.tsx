import type { ReactNode } from "react";
import { Link, type To } from "react-router-dom";
import { Menu, type MenuItem } from "./Menu";

interface ListRowProps {
  to: To;
  children: ReactNode;
  menuItems?: readonly MenuItem[];
  menuLabel?: string;
}

export function ListRow({ to, children, menuItems, menuLabel }: ListRowProps) {
  return (
    <div data-list-row className="relative flex items-center gap-3 rounded-[10px] px-3 py-2 hover:bg-row-hover motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out">
      <Link to={to} className="min-w-0 flex-1 py-1 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:inset-0 after:content-['']">
        {children}
      </Link>
      {menuItems !== undefined && menuItems.length > 0 && <Menu items={menuItems} label={menuLabel} />}
    </div>
  );
}
