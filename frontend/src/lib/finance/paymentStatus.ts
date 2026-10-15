import { compareMoney } from "../money";
import type { PaymentItem } from "./types";

export class PaymentStatus {
  static hasNotice(payment: Pick<PaymentItem, "is_voided" | "refunded_amount">): boolean {
    return payment.is_voided || compareMoney(payment.refunded_amount, "0") > 0;
  }
}
