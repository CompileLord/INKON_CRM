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
    <div className="absolute right-0 top-0" data-control="column-menu">
      <Menu items={items} label={t("bulk.menuLabel", { date: formattedDate })} />
    </div>
  );
};
