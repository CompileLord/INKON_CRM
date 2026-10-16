import { describe, expect, it } from "vitest";
import { ScoreBand } from "./ScoreBand";

describe("ScoreBand", () => {
  it("classifies percentages at the band boundaries", () => {
    expect([100, 75, 74.9, 50, 49.9, 0].map((value) => ScoreBand.of(value).name)).toEqual(["good", "good", "ok", "ok", "risk", "risk"]);
  });
  it("uses distinct semantic token classes, never a raw colour", () => {
    expect(ScoreBand.of(80).textClass).toBe("text-success");
    expect(ScoreBand.of(60).barClass).toBe("bg-warning");
    expect(ScoreBand.of(10).chipClass).toContain("text-destructive");
  });
});
