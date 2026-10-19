import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "../i18n";
import { useAuthStore } from "../store/authStore";
import { RoleGuard } from "../components/auth/RoleGuard";
import { isPathAllowed } from "../lib/auth/roleAccess";
import { NotFound } from "./NotFound";

function accessToken(role: string, id: string): string {
  const payload: Record<string, unknown> = { sub: id, role, exp: Math.floor(Date.now() / 1000) + 3600 };
  return `header.${btoa(JSON.stringify(payload))}.unit-fixture`;
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RoleGuard />}>
          <Route path="/" element={<div>Dashboard</div>} />
          <Route path="/audit" element={<div>Audit page</div>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useAuthStore.getState().setUnauthenticated();
});
afterEach(cleanup);

describe("404 for every role", () => {
  it.each([["mentor", "7"], ["student", "42"], ["accountant", "9"], ["superadmin", "1"]])("%s sees NotFound at an unknown path", (role, id) => {
    useAuthStore.getState().setAuthenticated(accessToken(role, id), null, false);
    renderAt("/foo");
    expect(screen.getByText("Page not found")).toBeTruthy();
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("still redirects a mentor away from a known superadmin-only route", () => {
    useAuthStore.getState().setAuthenticated(accessToken("mentor", "7"), null, false);
    renderAt("/audit");
    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.queryByText("Audit page")).toBeNull();
  });

  it("keeps known-route denial rules per role", () => {
    expect(isPathAllowed("mentor", "/finance", 7)).toBe(false);
    expect(isPathAllowed("student", "/courses", 42)).toBe(false);
    expect(isPathAllowed("mentor", "/foo/bar", 7)).toBe(true);
  });
});
