import { useRef, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";

export interface TabDefinition {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: readonly TabDefinition[];
  value: string;
  onChange: (tabId: string) => void;
  ariaLabel: string;
  orientation?: "horizontal" | "vertical";
  idPrefix?: string;
}

export function tabElementId(idPrefix: string, tabId: string): string {
  return `${idPrefix}-tab-${tabId}`;
}

export function tabPanelElementId(idPrefix: string, tabId: string): string {
  return `${idPrefix}-panel-${tabId}`;
}

export function Tabs({ tabs, value, onChange, ariaLabel, orientation = "horizontal", idPrefix = "tabs" }: TabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isVertical: boolean = orientation === "vertical";

  const moveSelection = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last: number = tabs.length - 1;
    const previousKey: string = isVertical ? "ArrowUp" : "ArrowLeft";
    const nextKey: string = isVertical ? "ArrowDown" : "ArrowRight";
    const target: number | null =
      event.key === nextKey ? (index === last ? 0 : index + 1)
      : event.key === previousKey ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (target === null) return;
    event.preventDefault();
    onChange(tabs[target].id);
    tabRefs.current[target]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      data-tabs={orientation}
      className={isVertical
        ? "flex flex-row gap-1 overflow-x-auto md:flex-col md:overflow-visible"
        : "flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}
    >
      {tabs.map((tab, index) => {
        const selected: boolean = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(element) => { tabRefs.current[index] = element; }}
            id={tabElementId(idPrefix, tab.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tabPanelElementId(idPrefix, tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => moveSelection(event, index)}
            className={[
              "inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "motion-safe:transition-[color,background-color,border-color] motion-safe:duration-150 motion-safe:ease-out",
              isVertical
                ? `rounded-[10px] md:w-full md:justify-start ${selected ? "bg-strip text-maroon-text" : "text-muted hover:bg-strip hover:text-ink"}`
                : `-mb-px border-b-2 ${selected ? "border-maroon text-maroon-text" : "border-transparent text-muted hover:text-ink"}`,
            ].join(" ")}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && <span className="text-xs tabular-nums text-muted">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export class TabQueryParam {
  static readonly NAME: string = "tab";

  static resolve(rawValue: string | null, tabIds: readonly string[], fallbackId: string): string {
    return rawValue !== null && tabIds.includes(rawValue) ? rawValue : fallbackId;
  }
}

export function useTabParam(tabIds: readonly string[], fallbackId: string): [string, (tabId: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const active: string = TabQueryParam.resolve(searchParams.get(TabQueryParam.NAME), tabIds, fallbackId);
  const select = (tabId: string): void => {
    setSearchParams((current: URLSearchParams) => {
      const next: URLSearchParams = new URLSearchParams(current);
      if (tabId === fallbackId) next.delete(TabQueryParam.NAME);
      else next.set(TabQueryParam.NAME, tabId);
      return next;
    }, { replace: true });
  };
  return [active, select];
}
