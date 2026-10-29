import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SlideOver } from "./SlideOver";
import { usePresence } from "./usePresence";
import "../../i18n";

afterEach(() => cleanup());

function Panel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { present, onOpenChangeComplete } = usePresence(open);
  if (!present) return null;
  return <SlideOver open={open} onClose={onClose} onOpenChangeComplete={onOpenChangeComplete} title="Presence panel"><p>Body</p></SlideOver>;
}

function Host() {
  const [open, setOpen] = useState<boolean>(false);
  return <><button onClick={() => setOpen(true)}>open</button><Panel open={open} onClose={() => setOpen(false)} /></>;
}

describe("drawers that unmount when closed", () => {
  it("mounts closed then opens, so the slide-in transition has a starting frame, and keeps the panel through its exit", async () => {
    let finishExit: () => void = () => {};
    const exitFinished: Promise<void> = new Promise<void>((resolve) => { finishExit = resolve; });
    Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [{ finished: exitFinished, effect: { getTiming: () => ({ duration: 200, iterations: 1 }) } }] });
    try {
      const user = userEvent.setup();
      render(<Host />);
      expect(screen.queryByRole("dialog")).toBeNull();
      await user.click(screen.getByText("open"));
      const dialog: HTMLElement = await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(dialog.hasAttribute("data-ending-style")).toBe(true));
      expect(screen.queryByRole("dialog")).not.toBeNull();
      await act(async () => { finishExit(); });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    } finally {
      delete (Element.prototype as unknown as Record<string, unknown>).getAnimations;
    }
  });

  it("opens with the starting-style attribute when the host mounts the panel already open", async () => {
    const seen: boolean[] = [];
    const observer: MutationObserver = new MutationObserver(() => {
      const dialog: Element | null = document.querySelector('[role="dialog"]');
      if (dialog) seen.push(dialog.hasAttribute("data-starting-style"));
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    render(<Panel open onClose={() => undefined} />);
    await screen.findByRole("dialog");
    observer.disconnect();
    expect(seen).toContain(true);
  });
});
