import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../store/authStore";
import { getSafeRedirect, resolveLandingPath } from "./postAuthRedirect";
import * as profiles from "./users/endpoints";

afterEach(() => useAuthStore.getState().setUnauthenticated());

describe("identity-owned landing context", () => {
  it.each([
    ["student", 42, "/students/42"],
    ["mentor", 7, "/mentors/7"],
    ["superadmin", 1, "/"],
    ["accountant", 2, "/"],
  ] as const)("uses %s identity without probing unauthorized profile endpoints", async (role, id, path) => {
    const studentLookup = vi.spyOn(profiles, "getMyStudentProfile");
    const mentorLookup = vi.spyOn(profiles, "getMyMentorProfile");
    const payload = { sub: String(id), role, exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = `header.${btoa(JSON.stringify(payload))}.unit-fixture`;
    useAuthStore.getState().setAuthenticated(token, null, false);
    await expect(resolveLandingPath()).resolves.toBe(path);
    expect(studentLookup).not.toHaveBeenCalled();
    expect(mentorLookup).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("handles internal redirects safely and rejects open redirect attempts", () => {
    expect(getSafeRedirect("/courses", "/")).toBe("/courses");
    expect(getSafeRedirect("/journals?period=2", "/")).toBe("/journals?period=2");
    expect(getSafeRedirect(null, "/fallback")).toBe("/fallback");
    expect(getSafeRedirect("", "/fallback")).toBe("/fallback");
    expect(getSafeRedirect("//evil.com", "/fallback")).toBe("/fallback");
    expect(getSafeRedirect("//evil.com/path", "/fallback")).toBe("/fallback");
    expect(getSafeRedirect("/\\evil.com", "/fallback")).toBe("/fallback");
    expect(getSafeRedirect("\\evil.com", "/fallback")).toBe("/fallback");
    expect(getSafeRedirect("/foo\\bar", "/fallback")).toBe("/fallback");
    expect(getSafeRedirect("https://evil.com", "/fallback")).toBe("/fallback");
    expect(getSafeRedirect("javascript:alert(1)", "/fallback")).toBe("/fallback");
  });
});
