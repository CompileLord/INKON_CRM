import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MockAdapter from "axios-mock-adapter";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./authStore";
import { tokenStorage } from "../lib/auth/tokenStorage";
import { httpClient } from "../lib/auth/httpClient";
import { bootstrapAuth } from "../lib/authBootstrap";
import { isPathAllowed } from "../lib/auth/roleAccess";
import { AuthGuard } from "../components/auth/AuthGuard";
import { RoleGuard } from "../components/auth/RoleGuard";
import { SetPasswordRoute } from "../components/auth/SetPasswordRoute";
import { GuestRoute } from "../components/auth/GuestRoute";

const mock = new MockAdapter(httpClient);

function accessToken(role = "student", id = "42", forced = false): string {
  const payload = { sub: id, role, exp: Math.floor(Date.now() / 1000) + 3600, ...(forced ? { scope: "must_set_password" } : {}) };
  return `header.${btoa(JSON.stringify(payload))}.unit-fixture`;
}

function routes(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<GuestRoute>Login</GuestRoute>} />
    <Route path="/set-password" element={<SetPasswordRoute>Required password setup</SetPasswordRoute>} />
    <Route element={<AuthGuard />}><Route element={<RoleGuard />}>
      <Route path="/" element={<div>Dashboard</div>} />
      <Route path="/students/:id" element={<div>Student profile</div>} />
      <Route path="/mentors/:id" element={<div>Mentor profile</div>} />
    </Route></Route>
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  mock.reset();
  useAuthStore.getState().setUnauthenticated();
});

afterEach(() => {
  cleanup();
  mock.reset();
  useAuthStore.getState().setUnauthenticated();
});

describe("restored and refreshed authentication", () => {
  it("deduplicates bootstrap while retaining canonical identity and forced-password state", async () => {
    useAuthStore.setState({ status: "initializing" });
    tokenStorage.setTokens({ accessToken: "expired", refreshToken: "isolated-unit-refresh" });
    mock.onPost("/auth/refresh").reply(200, { access_token: accessToken("mentor", "7", true), refresh_token: "rotated-unit-refresh", must_set_password: true });
    await Promise.all([bootstrapAuth(), bootstrapAuth()]);
    expect(mock.history.post).toHaveLength(1);
    expect(useAuthStore.getState()).toMatchObject({ status: "authenticated", userId: 7, role: "mentor", mustSetPassword: true });
    expect(tokenStorage.getRefreshToken()).toBe("rotated-unit-refresh");
    const view = routes("/mentors/7");
    expect(await view.findByText("Required password setup")).toBeTruthy();
  });

  it("synchronizes interceptor refresh state before retrying protected work", async () => {
    useAuthStore.getState().setAuthenticated(accessToken(), "isolated-unit-refresh", false);
    const fresh = accessToken("student", "42", true);
    mock.onGet("/identity-probe").replyOnce(401).onGet("/identity-probe").reply(() => {
      expect(useAuthStore.getState()).toMatchObject({ userId: 42, role: "student", mustSetPassword: true });
      return [200, {}];
    });
    mock.onPost("/auth/refresh").reply(200, { access_token: fresh, refresh_token: "rotated-unit-refresh", must_set_password: true });
    await httpClient.get("/identity-probe");
    expect(tokenStorage.getAccessToken()).toBe(fresh);
    expect(isPathAllowed("student", "/students/43", useAuthStore.getState().userId)).toBe(false);
  });

  it("fails closed for malformed identity and clears prior session state", () => {
    useAuthStore.getState().setAuthenticated(accessToken(), "isolated-unit-refresh", false);
    expect(() => useAuthStore.getState().setAuthenticated("malformed", null, false)).toThrow();
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", userId: null, role: null });
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it("clears identity when bootstrap refresh is rejected", async () => {
    useAuthStore.setState({ status: "initializing" });
    tokenStorage.setTokens({ accessToken: "expired", refreshToken: "isolated-unit-refresh" });
    mock.onPost("/auth/refresh").reply(401);
    await bootstrapAuth();
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", userId: null, role: null, mustSetPassword: false });
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it("does not restore a session after logout while bootstrap is pending", async () => {
    let finish: (response: [number, unknown]) => void = () => { throw new Error("Reply is not pending"); };
    const response = new Promise<[number, unknown]>((resolve) => { finish = resolve; });
    useAuthStore.setState({ status: "initializing" });
    tokenStorage.setTokens({ accessToken: "expired", refreshToken: "isolated-unit-refresh" });
    mock.onPost("/auth/refresh").reply(() => response);
    const restore = bootstrapAuth();
    useAuthStore.getState().setUnauthenticated();
    finish([200, { access_token: accessToken(), refresh_token: "late-refresh", must_set_password: false }]);
    await restore;
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(tokenStorage.getAccessToken()).toBeNull();
  });

  it("does not overwrite a new login with a late interceptor refresh", async () => {
    let finish: (response: [number, unknown]) => void = () => { throw new Error("Reply is not pending"); };
    let started: () => void = () => { throw new Error("Refresh is not pending"); };
    const response = new Promise<[number, unknown]>((resolve) => { finish = resolve; });
    const pending = new Promise<void>((resolve) => { started = resolve; });
    useAuthStore.getState().setAuthenticated(accessToken(), "old-unit-refresh", false);
    mock.onGet("/late-probe").reply(401);
    mock.onPost("/auth/refresh").reply(() => { started(); return response; });
    const oldRequest = httpClient.get("/late-probe").catch(() => undefined);
    await pending;
    useAuthStore.getState().setUnauthenticated();
    useAuthStore.getState().setAuthenticated(accessToken("mentor", "7"), "new-unit-refresh", false);
    finish([200, { access_token: accessToken(), refresh_token: "late-unit-refresh", must_set_password: false }]);
    await oldRequest;
    expect(useAuthStore.getState()).toMatchObject({ userId: 7, role: "mentor", status: "authenticated" });
    expect(tokenStorage.getRefreshToken()).toBe("new-unit-refresh");
  });
});

describe("identity and password route guards", () => {
  it.each([["student", "42", "/students/42", "Student profile"], ["mentor", "7", "/mentors/7", "Mentor profile"]])("allows %s self context and denies another identity", async (role, id, path, text) => {
    useAuthStore.getState().setAuthenticated(accessToken(role, id), null, false);
    const self = routes(path);
    expect(await self.findByText(text)).toBeTruthy();
    self.unmount();
    const other = routes(path.replace(id, "999"));
    expect(await other.findByText("Dashboard")).toBeTruthy();
  });

  it("retains scope-required setup even when a caller passes false", async () => {
    useAuthStore.getState().setAuthenticated(accessToken("student", "42", true), null, false);
    const view = routes("/login");
    expect(await view.findByText("Required password setup")).toBeTruthy();
  });

  it("allows normal identity only after receiving an unscoped setup result", async () => {
    useAuthStore.getState().setAuthenticated(accessToken("student", "42"), null, false);
    const view = routes("/set-password");
    expect(await view.findByText("Dashboard")).toBeTruthy();
  });

  it("keeps unauthenticated users out of forced-password and self-profile routes", async () => {
    const forced = routes("/set-password");
    expect(await forced.findByText("Login")).toBeTruthy();
    forced.unmount();
    const self = routes("/students/42");
    expect(await self.findByText("Login")).toBeTruthy();
  });
});
