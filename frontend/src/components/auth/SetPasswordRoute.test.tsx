import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SetPasswordRoute } from "./SetPasswordRoute";
import { useAuthStore } from "../../store/authStore";

function createMockToken(role: string, id: number, mustSetPassword = false): string {
  const payload = {
    sub: String(id),
    role,
    must_set_password: mustSetPassword,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `mock.${btoa(JSON.stringify(payload))}.sig`;
}

function renderSetPasswordRoute() {
  return render(
    <MemoryRouter initialEntries={["/set-password"]}>
      <Routes>
        <Route
          path="/set-password"
          element={
            <SetPasswordRoute>
              <div data-testid="set-password-content">Protected Set Password Form</div>
            </SetPasswordRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
        <Route path="/" element={<div data-testid="root-dashboard">Root Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.getState().setUnauthenticated();
});

afterEach(() => {
  cleanup();
});

describe("SetPasswordRoute guard", () => {
  it("renders FullscreenSpinner when auth status is initializing", () => {
    useAuthStore.setState({ status: "initializing" });
    renderSetPasswordRoute();

    expect(screen.queryByTestId("set-password-content")).toBeNull();
    expect(screen.queryByTestId("login-page")).toBeNull();
    expect(screen.queryByTestId("root-dashboard")).toBeNull();
  });

  it("redirects unauthenticated users to /login", () => {
    useAuthStore.getState().setUnauthenticated();
    renderSetPasswordRoute();

    expect(screen.getByTestId("login-page")).not.toBeNull();
    expect(screen.queryByTestId("set-password-content")).toBeNull();
  });

  it("redirects normal authenticated users (mustSetPassword=false) away to /", () => {
    const normalToken = createMockToken("student", 10, false);
    useAuthStore.getState().setAuthenticated(normalToken, "refresh-normal", false);
    renderSetPasswordRoute();

    expect(screen.getByTestId("root-dashboard")).not.toBeNull();
    expect(screen.queryByTestId("set-password-content")).toBeNull();
  });

  it("allows legitimate forced session users (mustSetPassword=true) to view protected content", () => {
    const forcedToken = createMockToken("student", 10, true);
    useAuthStore.getState().setAuthenticated(forcedToken, "refresh-forced", true);
    renderSetPasswordRoute();

    expect(screen.getByTestId("set-password-content")).not.toBeNull();
    expect(screen.queryByTestId("login-page")).toBeNull();
    expect(screen.queryByTestId("root-dashboard")).toBeNull();
  });
});
