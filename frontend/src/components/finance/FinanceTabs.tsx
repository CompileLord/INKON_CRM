import { useTranslation } from "react-i18next";
import { Tabs, type TabDefinition } from "../ui/Tabs";
import { FinanceUrlState, type FinanceTab } from "../../lib/finance/urlState";

interface FinanceTabsProps {
  selected: FinanceTab;
  onSelect: (tab: FinanceTab) => void;
}

export function FinanceTabs({ selected, onSelect }: FinanceTabsProps) {
  const { t } = useTranslation("finance");
  const tabs: readonly TabDefinition[] = FinanceUrlState.tabs.map((tab: FinanceTab) => ({ id: tab, label: t(`tabs.${tab}`) }));
  return <Tabs tabs={tabs} value={selected} onChange={(tabId: string) => onSelect(tabId as FinanceTab)} ariaLabel={t("tabsLabel")} idPrefix="finance" />;
}
