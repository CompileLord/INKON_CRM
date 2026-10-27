import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, type RenderResult } from "@testing-library/react";
import { useAuthStore } from "../../store/authStore";
import type { BuildInfo } from "../../lib/system/types";
import { formatDateTime } from "../../i18n/formatters";
import i18n from "../../i18n";
import { AboutSection, commitHashesDiffer } from "./AboutSection";

const mocks = vi.hoisted(() => ({
  query: { data: undefined, isLoading: false, isError: false } as { data: unknown; isLoading: boolean; isError: boolean },
  refetch: vi.fn(),
}));

vi.mock("../../config/version", () => ({
  APP_VERSION: "1.0.1",
  COMMIT_HASH: "abc1234",
  COMMIT_MESSAGE: "fix(settings): show build",
  BUILD_TIME: "2026-10-16T08:00:00.000Z",
  UNKNOWN_BUILD_VALUE: "unknown",
  APP_ENVIRONMENT: "production",
}));

vi.mock("../../lib/system/hooks", () => ({
  useServerBuildInfo: () => ({ ...mocks.query, refetch: mocks.refetch }),
}));

function serverBuild(commitSha: string): BuildInfo {
  return { version: "0.1.0", commit_sha: commitSha, commit_message: "feat(system): serve version", built_at: "2026-10-17T10:00:00Z" };
}

beforeEach(async () => {
  useAuthStore.setState({ role: "superadmin" });
  await i18n.changeLanguage("en");
  mocks.refetch.mockReset();
  mocks.query = { data: undefined, isLoading: false, isError: false };
});
afterEach(() => {
  cleanup();
  useAuthStore.setState({ role: null });
});

describe("AboutSection", () => {
  it.each(["mentor", "student", "accountant", null] as const)("shows only versions and no details block for %s", (role) => {
    useAuthStore.setState({ role });
    mocks.query = { data: serverBuild("abcdef1234567890"), isLoading: false, isError: false };
    const view: RenderResult = render(<AboutSection />);
    expect(screen.getByText("1.0.1")).toBeTruthy();
    expect(screen.getByText("0.1.0")).toBeTruthy();
    expect(screen.getByText("Production")).toBeTruthy();
    expect(view.container.querySelector("details")).toBeNull();
    expect(screen.queryByText("abc1234")).toBeNull();
    expect(screen.queryByText("fix(settings): show build")).toBeNull();
    expect(screen.queryByText("Details")).toBeNull();
  });

  it("matches loading geometry for the server row", () => {
    mocks.query = { data: undefined, isLoading: true, isError: false };
    render(<AboutSection />);
    const skeleton: HTMLElement = screen.getByLabelText(i18n.t("common:loading"));
    expect(skeleton.getAttribute("aria-busy")).toBe("true");
    expect(skeleton.children).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["superadmin", "student"] as const)("shows an error with a working retry for %s", (role) => {
    useAuthStore.setState({ role });
    mocks.query = { data: undefined, isLoading: false, isError: true };
    render(<AboutSection />);
    const alert: HTMLElement = screen.getByRole("alert");
    expect(within(alert).getByText("Couldn't load the server version.")).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps commit details inside a collapsed Details block for a superadmin", () => {
    mocks.query = { data: serverBuild("0123456789abcdef"), isLoading: false, isError: false };
    const view: RenderResult = render(<AboutSection />);
    const details: HTMLDetailsElement = view.container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText("Details")).toBeTruthy();
    fireEvent.click(within(details).getByText("Details"));
    expect(details.open).toBe(true);
  });

  it("lists the app and server builds separately when the commits differ", () => {
    mocks.query = { data: serverBuild("0123456789abcdef"), isLoading: false, isError: false };
    const view: RenderResult = render(<AboutSection />);
    const details: HTMLElement = view.container.querySelector("details") as HTMLElement;
    expect(within(details).getByText("App build")).toBeTruthy();
    expect(within(details).getByText("Server build")).toBeTruthy();
    expect(within(details).getByText("abc1234")).toBeTruthy();
    expect(within(details).getByText("0123456")).toBeTruthy();
    expect(within(details).getByText("fix(settings): show build")).toBeTruthy();
    expect(within(details).getByText("feat(system): serve version")).toBeTruthy();
    expect(within(details).getByText(formatDateTime(new Date("2026-10-16T08:00:00.000Z"), "en"))).toBeTruthy();
    expect(within(details).getByText(formatDateTime(new Date("2026-10-17T10:00:00Z"), "en"))).toBeTruthy();
  });

  it("shows the commit once when the app and server are on the same build", () => {
    mocks.query = { data: serverBuild("abc1234ffffffff"), isLoading: false, isError: false };
    const view: RenderResult = render(<AboutSection />);
    const details: HTMLElement = view.container.querySelector("details") as HTMLElement;
    expect(within(details).getByText("App and server are on the same build.")).toBeTruthy();
    expect(within(details).getAllByText("abc1234")).toHaveLength(1);
    expect(within(details).queryByText("Server build")).toBeNull();
  });

  it("hides the server build when the server reports no commit details", () => {
    mocks.query = { data: { version: "0.1.0", commit_sha: null, commit_message: null, built_at: null }, isLoading: false, isError: false };
    const view: RenderResult = render(<AboutSection />);
    const details: HTMLElement = view.container.querySelector("details") as HTMLElement;
    expect(within(details).queryByText("Server build")).toBeNull();
    expect(within(details).queryByText("Unknown")).toBeNull();
  });

  it("shows only the app build when the server build is unavailable", () => {
    mocks.query = { data: undefined, isLoading: false, isError: true };
    const view: RenderResult = render(<AboutSection />);
    const details: HTMLElement = view.container.querySelector("details") as HTMLElement;
    expect(within(details).getByText("abc1234")).toBeTruthy();
    expect(within(details).queryByText("Server build")).toBeNull();
  });
});

describe("commitHashesDiffer", () => {
  it("treats a short hash as a prefix of the full server hash", () => {
    expect(commitHashesDiffer("abc1234", "abc1234ffff")).toBe(false);
  });

  it("flags different hashes", () => {
    expect(commitHashesDiffer("abc1234", "def5678aaaa")).toBe(true);
  });

  it("never flags unknown values", () => {
    expect(commitHashesDiffer("dev", "def5678aaaa")).toBe(false);
    expect(commitHashesDiffer("abc1234", "unknown")).toBe(false);
  });
});
