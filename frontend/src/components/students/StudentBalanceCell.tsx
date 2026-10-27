import { useTranslation } from "react-i18next";
import type { StudentListItemResponse } from "../../lib/users/types";
import { formatCompactAmount } from "./studentBalance";

interface StudentBalanceCellProps {
  paymentStatus: StudentListItemResponse["payment_status"];
  debtAmount: string;
}

export function StudentBalanceCell({ paymentStatus, debtAmount }: StudentBalanceCellProps) {
  const { t } = useTranslation(["students", "finance"]);

  if (paymentStatus === "grant") {
    return <span className="text-sm text-muted">{t("students:table.balanceGrant")}</span>;
  }
  if (paymentStatus === "debt") {
    const amountText: string = t("finance:moneyAmount", { amount: formatCompactAmount(debtAmount) });
    return <span className="whitespace-nowrap text-sm font-medium tabular-nums text-destructive">{t("students:table.balanceDebt", { amount: amountText })}</span>;
  }
  return <span className="text-sm tabular-nums text-ink">{t("finance:moneyAmount", { amount: "0" })}</span>;
}
