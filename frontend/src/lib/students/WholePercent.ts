import { formatNumber } from "../../i18n/formatters";

export class WholePercent {
  static format(value: number, lng?: string): string {
    return `${formatNumber(value, lng, { maximumFractionDigits: 0 })}%`;
  }
}
