import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip } from "./Tooltip";
import { EmptyValue } from "./EmptyValue";

describe("Tooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("opens after a hover delay and closes on leave", () => {
    render(<Tooltip content="Hint"><button type="button">Target</button></Tooltip>);
    const target: HTMLElement = screen.getByRole("button", { name: "Target" });
    fireEvent.pointerEnter(target.parentElement as HTMLElement, { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole("tooltip").textContent).toBe("Hint");
    fireEvent.pointerLeave(target.parentElement as HTMLElement, { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on keyboard focus of a focusable anchor and closes on Escape", () => {
    render(<Tooltip content="Hint" focusable><span>Target</span></Tooltip>);
    const anchor: HTMLElement = screen.getByText("Target").parentElement as HTMLElement;
    expect(anchor.tabIndex).toBe(0);
    fireEvent.focus(anchor);
    expect(screen.getByRole("tooltip").textContent).toBe("Hint");
    expect(anchor.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("EmptyValue", () => {
  it("shows a dash with the reason as accessible name and tooltip", () => {
    render(<EmptyValue reason="Phone not provided" />);
    const anchor: HTMLElement = screen.getByLabelText("Phone not provided").parentElement as HTMLElement;
    expect(screen.getByLabelText("Phone not provided").textContent).toBe("—");
    fireEvent.focus(anchor);
    expect(screen.getByRole("tooltip").textContent).toBe("Phone not provided");
  });
});
