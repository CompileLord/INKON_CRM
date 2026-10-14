import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../../i18n";
import { JournalSaveStatus } from "./JournalSaveStatus";
import { IDLE_REGISTRY_SNAPSHOT, type JournalRegistrySnapshot } from "../../lib/journals/JournalQueueRegistry";
import type { JournalSavePhase } from "../../lib/journals/journalQueueTypes";

afterEach(() => cleanup());

function statusFor(phase: JournalSavePhase, counts: Partial<JournalRegistrySnapshot["counts"]> = {}): JournalRegistrySnapshot {
  return { ...IDLE_REGISTRY_SNAPSHOT, phase, counts: { conflicts: 0, failed: 0, saving: 0, unsaved: 0, ...counts } };
}

describe("JournalSaveStatus", () => {
  it.each([
    ["unsaved", { unsaved: 2 }, "Unsaved changes"],
    ["saving", { saving: 1 }, "Saving…"],
    ["saved", {}, "All changes saved"],
    ["failed", { failed: 3 }, "Changes not saved"],
    ["conflict", { conflicts: 1 }, "Version conflict, review needed"],
  ] as const)("announces %s through one polite live region", (phase, counts, text) => {
    render(<JournalSaveStatus status={statusFor(phase, counts)} onRetry={vi.fn()} onReview={vi.fn()} />);
    const regions = screen.getAllByRole("status");
    expect(regions).toHaveLength(1);
    expect(regions[0].getAttribute("aria-live")).toBe("polite");
    expect(regions[0].textContent).toContain(text);
  });

  it("renders an empty live region when idle so nothing is announced", () => {
    render(<JournalSaveStatus status={statusFor("idle")} onRetry={vi.fn()} onReview={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the unsettled count in tabular numerals", () => {
    render(<JournalSaveStatus status={statusFor("failed", { failed: 3 })} onRetry={vi.fn()} onReview={vi.fn()} />);
    const count = screen.getByText("(3)");
    expect(count.className).toContain("tabular-nums");
  });

  it("offers Retry for failed and Review for conflict, and only those actions", () => {
    const onRetry = vi.fn();
    const onReview = vi.fn();
    const { rerender } = render(<JournalSaveStatus status={statusFor("failed", { failed: 1 })} onRetry={onRetry} onReview={onReview} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Review" })).toBeNull();

    rerender(<JournalSaveStatus status={statusFor("conflict", { conflicts: 1 })} onRetry={onRetry} onReview={onReview} />);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("never shows the saved message for an unsettled phase", () => {
    render(<JournalSaveStatus status={statusFor("unsaved", { unsaved: 1 })} onRetry={vi.fn()} onReview={vi.fn()} />);
    expect(screen.queryByText("All changes saved")).toBeNull();
  });
});
