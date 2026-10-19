import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { WorkspaceTab } from "../../lib/journals/JournalWorkspaceSelection";

interface JournalWorkspaceTabsProps {
  selected: WorkspaceTab;
  onSelect: (tab: WorkspaceTab) => void;
  idPrefix: string;
}

const TABS: readonly WorkspaceTab[] = ["gradebook", "progress"];

export const JournalWorkspaceTabs: React.FC<JournalWorkspaceTabsProps> = ({ selected, onSelect, idPrefix }) => {
  const { t } = useTranslation("journals");
  const tabRefs = useRef<Map<WorkspaceTab, HTMLButtonElement>>(new Map());

  const moveSelection = (event: React.KeyboardEvent<HTMLButtonElement>, tab: WorkspaceTab): void => {
    const index: number = TABS.indexOf(tab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab: WorkspaceTab = TABS[nextIndex];
    onSelect(nextTab);
    tabRefs.current.get(nextTab)?.focus();
  };

  return (
    <div role="tablist" aria-label={t("workspace.tabsLabel")} className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const isSelected: boolean = tab === selected;
        return (
          <button
            key={tab}
            ref={(element) => {
              if (element) tabRefs.current.set(tab, element);
              else tabRefs.current.delete(tab);
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab}`}
            aria-selected={isSelected}
            aria-controls={`${idPrefix}-panel-${tab}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(tab)}
            onKeyDown={(event) => moveSelection(event, tab)}
            className={`-mb-px min-h-11 border-b-2 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${
              isSelected
                ? "border-maroon text-maroon-text"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t(`workspace.tabs.${tab}`)}
          </button>
        );
      })}
    </div>
  );
};
