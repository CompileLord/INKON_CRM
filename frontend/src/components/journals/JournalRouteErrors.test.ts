import { describe, expect, it } from "vitest";
import { AuthApiError } from "../../lib/auth/errors";
import { JournalRouteErrors } from "./JournalRouteErrors";

describe("JournalRouteErrors.denialOf", () => {
  it("classifies 403 as forbidden and 404 as not found", () => {
    expect(JournalRouteErrors.denialOf(new AuthApiError(403, "no"))).toBe("forbidden");
    expect(JournalRouteErrors.denialOf(new AuthApiError(404, "gone"))).toBe("notFound");
  });

  it("reads a status carried by a plain error object", () => {
    expect(JournalRouteErrors.denialOf({ status: 403 })).toBe("forbidden");
    expect(JournalRouteErrors.denialOf({ status: 404 })).toBe("notFound");
  });

  it("leaves server, network and unknown failures retryable", () => {
    expect(JournalRouteErrors.denialOf(new AuthApiError(500, "boom"))).toBeNull();
    expect(JournalRouteErrors.denialOf(new AuthApiError(401, "expired"))).toBeNull();
    expect(JournalRouteErrors.denialOf(new Error("offline"))).toBeNull();
    expect(JournalRouteErrors.denialOf(null)).toBeNull();
    expect(JournalRouteErrors.denialOf({ status: "403" })).toBeNull();
  });
});
