export type ScoreBandName = "good" | "ok" | "risk";

export interface ScoreBandStyle {
  name: ScoreBandName;
  textClass: string;
  chipClass: string;
  barClass: string;
}

const GOOD_THRESHOLD: number = 75;
const OK_THRESHOLD: number = 50;

export class ScoreBand {
  static of(percentage: number): ScoreBandStyle {
    if (percentage >= GOOD_THRESHOLD) {
      return { name: "good", textClass: "text-success", chipClass: "bg-success-surface text-success", barClass: "bg-success" };
    }
    if (percentage >= OK_THRESHOLD) {
      return { name: "ok", textClass: "text-warning", chipClass: "bg-warning-surface text-warning", barClass: "bg-warning" };
    }
    return { name: "risk", textClass: "text-destructive", chipClass: "bg-danger-surface text-destructive", barClass: "bg-destructive" };
  }
}
