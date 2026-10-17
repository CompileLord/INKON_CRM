import { afterEach, describe, expect, it, vi } from "vitest";

async function loadVersionModule() {
  vi.resetModules();
  return import("./version");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("build constants", () => {
  it("compose the full version string from the injected version and hash", async () => {
    vi.stubGlobal("__APP_VERSION__", "2.3.4");
    vi.stubGlobal("__COMMIT_HASH__", "abc1234");
    vi.stubGlobal("__COMMIT_MESSAGE__", "fix(settings): show build");
    vi.stubGlobal("__BUILD_TIME__", "2026-10-17T10:00:00.000Z");
    const version = await loadVersionModule();
    expect(version.FULL_VERSION_STRING).toBe("v2.3.4 (abc1234)");
    expect(version.COMMIT_MESSAGE).toBe("fix(settings): show build");
    expect(version.BUILD_TIME).toBe("2026-10-17T10:00:00.000Z");
  });
});
