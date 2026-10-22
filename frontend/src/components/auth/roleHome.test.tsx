import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RoleGuard } from "./RoleGuard";
import { isPathAllowed } from "../../lib/auth/roleAccess";
import { resolveLandingPath } from "../../lib/postAuthRedirect";
import { useAuthStore } from "../../store/authStore";

function accessToken(role: string, id: string): string {
  const payload: Record<string, unknown> = { sub: id, role, exp: Math.floor(Date.now() / 1000) + 3600 };
  return `header.${btoa(JSON.stringify(payload))}.unit-fixture`;
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RoleGuard />}>
          <Route path="/" element={<div>Role home</div>} />
          <Route path="/my/courses" element={<div>Student courses</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => useAuthStore.getState().setUnauthenticated());
afterEach(cleanup);

describe("role home and wrong-role redirects", () => {
  it.each([["student", "5"], ["mentor", "6"], ["superadmin", "1"], ["accountant", "9"]])("%s lands on the one home", async (role: string, id: string) => {
    useAuthStore.getState().setAuthenticated(accessToken(role, id), null, false);
    expect(await resolveLandingPath()).toBe("/");
  });

  it.each([["superadmin", "1"], ["accountant", "9"], ["mentor", "6"]])("%s opening /my/courses is redirected home", (role: string, id: string) => {
    useAuthStore.getState().setAuthenticated(accessToken(role, id), null, false);
    renderAt("/my/courses");
    expect(screen.getByText("Role home")).toBeTruthy();
    expect(screen.queryByText("Student courses")).toBeNull();
  });

  it("keeps /my/courses for a student", () => {
    useAuthStore.getState().setAuthenticated(accessToken("student", "5"), null, false);
    renderAt("/my/courses");
    expect(screen.getByText("Student courses")).toBeTruthy();
    expect(isPathAllowed("student", "/my/courses/3/journal", 5)).toBe(true);
  });
});
