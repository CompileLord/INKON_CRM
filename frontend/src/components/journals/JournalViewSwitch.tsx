import React from "react";
import { useTranslation } from "react-i18next";
import type { GradebookView } from "../../lib/journals/JournalWorkspaceSelection";

interface JournalViewSwitchProps {
  selected: GradebookView;
  onSelect: (view: GradebookView) => void;
  gridLabelKey: "workspace.view.grid" | "workspace.view.lesson";
}

const VIEWS: readonly GradebookView[] = ["grid", "summary"];

export const JournalViewSwitch: React.FC<JournalViewSwitchProps> = ({ selected, onSelect, gridLabelKey }) => {
  const { t } = useTranslation("journals");
  return (
    <div
      role="group"
      aria-label={t("workspace.viewLabel")}
      className="inline-flex rounded-[10px] border border-control-border bg-card p-px"
    >
      {VIEWS.map((view) => {
        const isSelected: boolean = view === selected;
        return (
          <button
            key={view}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(view)}
            className={`min-h-11 min-w-20 rounded-[8px] px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] ${
              isSelected ? "bg-maroon text-on-primary" : "text-ink hover:bg-strip"
            }`}
          >
            {view === "grid" ? t(gridLabelKey) : t("workspace.view.summary")}
          </button>
        );
      })}
    </div>
  );
};
