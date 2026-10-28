import { createContext, useContext, type ReactNode } from "react";
import { InfoTooltip } from "./InfoTooltip";

const SectionNestingContext = createContext<boolean>(false);

interface SectionCardProps {
  title: string;
  info?: string;
  titleHidden?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}

export function SectionCard({ title, info, titleHidden = false, actions, children }: SectionCardProps) {
  const isNested: boolean = useContext(SectionNestingContext);
  const hasVisibleHeader: boolean = !titleHidden || info !== undefined || actions !== undefined;
  const header: ReactNode = (
    <>
      {titleHidden && <h2 className="sr-only">{title}</h2>}
      {hasVisibleHeader && (
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${titleHidden ? "justify-end" : "justify-between"}`}>
          {!titleHidden && (
            <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-ink">
              <span className="min-w-0 break-words">{title}</span>
              {info !== undefined && <InfoTooltip label={info}>{info}</InfoTooltip>}
            </h2>
          )}
          {(titleHidden && info !== undefined) || actions !== undefined ? (
            <div className="flex shrink-0 items-center gap-2">
              {titleHidden && info !== undefined && <InfoTooltip label={info}>{info}</InfoTooltip>}
              {actions}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
  if (isNested) {
    return (
      <section data-section-card data-section-flattened className="flex flex-col gap-3">
        {header}
        {children}
      </section>
    );
  }
  return (
    <SectionNestingContext.Provider value={true}>
      <section data-section-card className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 md:p-5">
        {header}
        {children}
      </section>
    </SectionNestingContext.Provider>
  );
}
