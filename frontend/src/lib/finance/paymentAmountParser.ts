import { isPositiveMoney } from "../money";

export type PaymentAmountProblem = "empty" | "invalid" | "notPositive";

export type PaymentAmountResult =
  | { canonical: string; problem: null }
  | { canonical: null; problem: PaymentAmountProblem };

export class PaymentAmountParser {
  private static readonly groupingWhitespace: RegExp = /\s/g;
  private static readonly decimalPattern: RegExp = /^\d+([.,]\d+)?$/;

  static parse(raw: string): PaymentAmountResult {
    const compact: string = raw.replace(PaymentAmountParser.groupingWhitespace, "");
    if (compact === "") return { canonical: null, problem: "empty" };
    if (!PaymentAmountParser.decimalPattern.test(compact)) return { canonical: null, problem: "invalid" };
    const canonical: string = compact.replace(",", ".");
    return isPositiveMoney(canonical) ? { canonical, problem: null } : { canonical: null, problem: "notPositive" };
  }
}
