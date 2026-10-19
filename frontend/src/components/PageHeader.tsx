import type { ReactNode } from "react";
import { Link, type To } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  title?: ReactNode;
  titleIcon?: ReactNode;
  count?: ReactNode;
  info?: ReactNode;
  backTo?: To;
  backState?: unknown;
  backLabel?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, titleIcon, count, info, backTo, backState, backLabel, actions, children }: PageHeaderProps) {
  const hasTitleRow: boolean = title !== undefined || actions !== undefined;
  return (
    <header data-page-header className="flex min-w-0 flex-col gap-1">
      {backTo !== undefined && backLabel !== undefined && (
        <Link
          to={backTo}
          state={backState}
          data-page-back
          className="inline-flex min-h-11 w-fit max-w-full items-center gap-2 text-sm font-medium text-nav hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
        >
          <ArrowLeft size={16} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 break-words">{backLabel}</span>
        </Link>
      )}
      {hasTitleRow && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          {title !== undefined && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="flex min-w-0 items-center gap-2 break-words text-2xl font-semibold leading-8 text-ink md:text-[28px] md:leading-9">
                {titleIcon}
                {title}
              </h1>
              {count !== undefined && <span className="text-base font-normal text-muted tabular-nums md:text-lg">{count}</span>}
              {info}
            </div>
          )}
          {actions !== undefined && <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1">{actions}</div>}
        </div>
      )}
      {children}
    </header>
  );
}
