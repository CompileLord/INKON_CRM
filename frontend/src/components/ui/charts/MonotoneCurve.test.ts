import { describe, expect, it } from "vitest";
import { MonotoneCurve } from "./MonotoneCurve";

describe("MonotoneCurve", () => {
  it("splits values into runs separated by missing periods", () => {
    const runs = MonotoneCurve.splitIntoRuns([10, 20, null, 30, null, null, 40, 50]);
    expect(runs.map((run) => run.map((vertex) => vertex.index))).toEqual([[0, 1], [3], [6, 7]]);
  });

  it("builds an empty, single-point and cubic path", () => {
    expect(MonotoneCurve.pathThrough([])).toBe("");
    expect(MonotoneCurve.pathThrough([{ x: 1, y: 2 }])).toBe("M1,2");
    expect(MonotoneCurve.pathThrough([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toMatch(/^M0,0C/);
  });

  it("never overshoots the vertices of a flat-then-rising series", () => {
    const path = MonotoneCurve.pathThrough([{ x: 0, y: 50 }, { x: 10, y: 50 }, { x: 20, y: 10 }]);
    const controlYs = [...path.matchAll(/C[\d.-]+,([\d.-]+),[\d.-]+,([\d.-]+)/g)].flatMap((match) => [Number(match[1]), Number(match[2])]);
    controlYs.forEach((y) => {
      expect(y).toBeLessThanOrEqual(50);
      expect(y).toBeGreaterThanOrEqual(10);
    });
  });
});
