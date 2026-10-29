import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Tabs, TAB_PANEL_ENTER_CLASS } from "./Tabs";

const TABS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
] as const;

const LEFTS: Record<string, number> = { Alpha: 0, Beta: 100, Gamma: 250 };
const WIDTHS: Record<string, number> = { Alpha: 80, Beta: 120, Gamma: 60 };

describe("Tabs sliding indicator", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetLeft", { configurable: true, get(this: HTMLElement) { return LEFTS[this.textContent ?? ""] ?? 0; } });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get(this: HTMLElement) { return WIDTHS[this.textContent ?? ""] ?? 0; } });
  });

  afterEach(() => {
    cleanup();
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetLeft;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
  });

  const indicator = (): HTMLElement => document.querySelector("[data-tab-indicator]") as HTMLElement;

  it("places one indicator under the active tab using transform and width", () => {
    render(<Tabs tabs={TABS} value="b" onChange={() => undefined} ariaLabel="x" />);
    expect(indicator().style.transform).toBe("translateX(100px)");
    expect(indicator().style.width).toBe("120px");
    expect(screen.getByRole("tab", { name: "Beta" }).className).not.toContain("border-b-2");
  });

  it("moves the same indicator element to the new tab, and animates transform and width in 200ms", async () => {
    const view = render(<Tabs tabs={TABS} value="a" onChange={() => undefined} ariaLabel="x" />);
    const element: HTMLElement = indicator();
    view.rerender(<Tabs tabs={TABS} value="c" onChange={() => undefined} ariaLabel="x" />);
    expect(indicator()).toBe(element);
    expect(element.style.transform).toBe("translateX(250px)");
    expect(element.style.width).toBe("60px");
    await waitFor(() => expect(indicator().className).toContain("motion-safe:transition-[transform,width]"));
    expect(indicator().className).toContain("motion-safe:duration-200");
    expect(indicator().className).toContain("motion-safe:ease-out");
  });

  it("has no indicator on vertical tabs and exposes a 150ms panel fade class", () => {
    render(<Tabs tabs={TABS} value="a" onChange={() => undefined} ariaLabel="x" orientation="vertical" />);
    expect(indicator()).toBeNull();
    expect(TAB_PANEL_ENTER_CLASS).toContain("tab-panel-in_150ms");
    expect(TAB_PANEL_ENTER_CLASS).toContain("motion-safe:");
  });
});
