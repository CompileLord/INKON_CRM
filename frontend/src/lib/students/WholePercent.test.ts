import { describe, expect, it } from "vitest";
import { WholePercent } from "./WholePercent";

describe("WholePercent", () => {
  it("rounds to a whole number in every locale", () => {
    expect(WholePercent.format(84.1667, "en")).toBe("84%");
    expect(WholePercent.format(63.33, "ru")).toBe("63%");
    expect(WholePercent.format(82.5, "ru")).toMatch(/^8[23]%$/);
    expect(WholePercent.format(0, "en")).toBe("0%");
  });
});
