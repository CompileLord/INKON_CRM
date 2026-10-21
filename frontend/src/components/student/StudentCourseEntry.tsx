import type { ReactNode } from "react";
import { ListRow } from "../ui/ListRow";

interface StudentCourseEntryProps {
  to: string;
  isNavigable: boolean;
  children: ReactNode;
}

export function StudentCourseEntry({ to, isNavigable, children }: StudentCourseEntryProps) {
  if (isNavigable) return <ListRow to={to}>{children}</ListRow>;
  return <div data-list-row className="rounded-[10px] px-3 py-2"><div className="py-1">{children}</div></div>;
}
