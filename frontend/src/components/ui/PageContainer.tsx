import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
}

export function PageContainer({ children }: PageContainerProps) {
  return <div data-page-container className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-6">{children}</div>;
}
