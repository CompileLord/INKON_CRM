import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
}));

vi.mock("../../lib/system/hooks", () => ({
  useServerBuildInfo: () => ({ ...mocks.query, refetch: mocks.refetch }),
}));

function serverBuild(commitSha: string) {
  return { version: "0.1.0", commit_sha: commitSha, commit_message: "feat(system): serve version", built_at: "2026-10-17T10:00:00Z" };
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  mocks.refetch.mockReset();
  mocks.query = { data: undefined, isLoading: false, isError: false };
});
afterEach(() => cleanup());

describe("AboutSection", () => {
  it("shows a skeleton for the server row while loading", () => {
    mocks.query = { data: undefined, isLoading: true, isError: false };
    render(<AboutSection />);
    expect(screen.getByLabelText(i18n.t("common:loading")).getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an error with a working retry", () => {
    mocks.query = { data: undefined, isLoading: false, isError: true };
    render(<AboutSection />);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Couldn't load the server version.")).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the server version, short hash, commit name and build time", () => {
    mocks.query = { data: serverBuild("abcdef1234567890"), isLoading: false, isError: false };
    render(<AboutSection />);
    expect(screen.getByText("abcdef1")).toBeTruthy();
    expect(screen.getByText("feat(system): serve version")).toBeTruthy();
    expect(screen.getByText("0.1.0")).toBeTruthy();
    expect(screen.getAllByText("Built")).toHaveLength(2);
    expect(screen.getByText("abc1234")).toBeTruthy();
    expect(screen.getByText("fix(settings): show build")).toBeTruthy();
  });

  it("hints that the app and server differ when the commits differ", () => {
    mocks.query = { data: serverBuild("0123456789abcdef"), isLoading: false, isError: false };
    render(<AboutSection />);
    expect(screen.queryByText(/different commits/)).not.toBeNull();
  });

  it("shows no hint when the commits match", () => {
    mocks.query = { data: serverBuild("abc1234ffffffff"), isLoading: false, isError: false };
    render(<AboutSection />);
    expect(screen.queryByText(/different commits/)).toBeNull();
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
