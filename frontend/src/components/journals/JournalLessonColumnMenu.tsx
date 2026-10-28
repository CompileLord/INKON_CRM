import React from "react";
import { useTranslation } from "react-i18next";
import { Menu, type MenuItem } from "../ui/Menu";
import type { JournalBulkFillKind } from "../../lib/journals/JournalBulkFill";

interface JournalLessonColumnMenuProps {
  formattedDate: string;
  onFill: (kind: JournalBulkFillKind) => void;
}

const BULK_ACTIONS: readonly JournalBulkFillKind[] = ["markPresent", "fillHomework"];

export const JournalLessonColumnMenu: React.FC<JournalLessonColumnMenuProps> = ({ formattedDate, onFill }) => {
  const { t } = useTranslation("journals");
  const items: MenuItem[] = BULK_ACTIONS.map((action: JournalBulkFillKind): MenuItem => ({ key: action, label: t(`bulk.${action}`), onSelect: () => onFill(action) }));
  return (
    <div className="pointer-events-none absolute right-0 top-0 opacity-0 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 group-focus-within/column:pointer-events-auto group-focus-within/column:opacity-100 group-hover/column:pointer-events-auto group-hover/column:opacity-100 has-[[data-popup-open]]:pointer-events-auto has-[[data-popup-open]]:opacity-100 motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-out"
      data-control="column-menu">
      <Menu items={items} label={t("bulk.menuLabel", { date: formattedDate })} />
    </div>
  );
};
