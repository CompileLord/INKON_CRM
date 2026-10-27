import Big from "big.js";
import { formatExactMoney, isValidMoneyString } from "../../lib/money";

export function formatCompactAmount(value: string): string {
  if (!isValidMoneyString(value)) return value;
  const exact: string = formatExactMoney(new Big(value).toFixed());
  return exact.replace(/\.00$/, "");
}
