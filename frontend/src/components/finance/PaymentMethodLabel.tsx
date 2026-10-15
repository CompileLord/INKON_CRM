import { Banknote, Landmark } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PaymentMethod } from "../../lib/finance/types";

interface PaymentMethodLabelProps {
  method: PaymentMethod | null | undefined;
  iconSize?: number;
}

export function PaymentMethodLabel({ method, iconSize = 14 }: PaymentMethodLabelProps) {
  const { t } = useTranslation(["finance", "common"]);
  return (
    <span className="inline-flex items-center gap-1.5">
      {method === "transfer" ? <Landmark size={iconSize} aria-hidden="true" /> : <Banknote size={iconSize} aria-hidden="true" />}
      {method ? t(`common:enums.paymentMethod.${method}`) : t("finance:paymentDetail.unavailable")}
    </span>
  );
}
