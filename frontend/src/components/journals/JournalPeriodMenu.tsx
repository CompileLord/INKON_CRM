import React from "react";
import { useTranslation } from "react-i18next";
import { Menu, type MenuItem } from "../ui/Menu";

interface JournalPeriodMenuProps {
  onOpenSettings: () => void;
}

export const JournalPeriodMenu: React.FC<JournalPeriodMenuProps> = ({ onOpenSettings }) => {
  const { t } = useTranslation("journals");
  const items: MenuItem[] = [{ key: "settings", label: t("workspace.periodSettings"), onSelect: onOpenSettings }];
  return (
    <span data-period-menu="" className="inline-flex">
      <Menu items={items} label={t("workspace.periodMenuLabel")} />
    </span>
  );
};
