import { useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { FinanceUrlState, type FinanceTab } from "../../lib/finance/urlState";

interface FinanceTabsProps {
  selected: FinanceTab;
  onSelect: (tab: FinanceTab) => void;
}

export function FinanceTabs({ selected, onSelect }: FinanceTabsProps) {
  const { t } = useTranslation("finance");
  const tabRefs = useRef<Record<FinanceTab, HTMLButtonElement | null>>({ overview: null, debtors: null, payments: null });

  const moveSelection = (event: KeyboardEvent<HTMLButtonElement>, tab: FinanceTab): void => {
    const tabs: readonly FinanceTab[] = FinanceUrlState.tabs;
    const index: number = tabs.indexOf(tab);
    const target: FinanceTab | undefined =
      event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length]
      : event.key === "ArrowLeft" ? tabs[(index - 1 + tabs.length) % tabs.length]
      : event.key === "Home" ? tabs[0]
      : event.key === "End" ? tabs[tabs.length - 1]
      : undefined;
    if (!target) return;
    event.preventDefault();
    onSelect(target);
    tabRefs.current[target]?.focus();
  };

  return (
    <div role="tablist" aria-label={t("tabsLabel")} className="grid grid-cols-3 border-b border-border sm:flex sm:gap-6">
      {FinanceUrlState.tabs.map((tab) => {
        const isSelected: boolean = tab === selected;
        return (
          <button
            key={tab}
            ref={(element) => {
              tabRefs.current[tab] = element;
            }}
            type="button"
            role="tab"
            id={`finance-tab-${tab}`}
            aria-selected={isSelected}
            aria-controls={`finance-panel-${tab}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(tab)}
            onKeyDown={(event) => moveSelection(event, tab)}
            className={`min-h-11 break-words border-b-2 px-2 py-2 text-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isSelected ? "border-maroon text-maroon-text" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t(`tabs.${tab}`)}
          </button>
        );
      })}
    </div>
  );
}
