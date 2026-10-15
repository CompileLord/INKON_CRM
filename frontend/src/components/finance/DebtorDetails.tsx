import { useTranslation } from "react-i18next";
import type { DebtItem } from "../../lib/finance/types";
import { formatExactMoney } from "../../lib/money";
import { InfoTooltip } from "../ui/InfoTooltip";
import { DebtorOverdue } from "./DebtorOverdue";

interface DebtorDetailsProps {
  id: string;
  debt: DebtItem;
}

export function DebtorDetails({ id, debt }: DebtorDetailsProps) {
  const { t } = useTranslation("finance");
  const money = (amount: string): string => t("moneyAmount", { amount: formatExactMoney(amount) });
  return (
    <dl id={id} className="grid grid-cols-1 gap-x-6 gap-y-3 bg-strip px-4 py-3 text-sm @[30rem]:grid-cols-2">
      <div>
        <dt className="text-label">{t("debtorsTab.contracted")}</dt>
        <dd className="font-medium tabular-nums">{money(debt.price_at_enrollment)}</dd>
      </div>
      <div>
        <dt className="text-label">{t("debtorsTab.billed")}</dt>
        <dd className="font-medium tabular-nums">{money(debt.billed_to_date)}</dd>
      </div>
      <div>
        <dt className="flex items-center gap-1 text-label">
          {t("debtorsTab.settled")}
          <InfoTooltip label={t("overview.aboutMetric", { label: t("debtorsTab.settled") })}>{t("debtorsTab.settledInfo")}</InfoTooltip>
        </dt>
        <dd className="font-medium tabular-nums">{money(debt.total_paid)}</dd>
      </div>
      <div>
        <dt className="text-label">{t("debtorsTab.dueUnpaid")}</dt>
        <dd className="font-semibold tabular-nums">{money(debt.debt)}</dd>
      </div>
      <div>
        <dt className="text-label">{t("debtorsTab.daysOverdue")}</dt>
        <dd>
          <DebtorOverdue days={debt.overdue_days} />
        </dd>
      </div>
    </dl>
  );
}
