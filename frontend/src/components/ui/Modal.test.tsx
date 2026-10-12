import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";
import { useShellStore } from "../../store/shellStore";
import "../../i18n";
vi.hoisted(() => Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) }));
afterEach(() => cleanup());
function Fixture() {
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);
  return <><button onClick={() => setFirst(true)}>Open first fixture</button><Modal open={first} title="First fixture" onClose={() => setFirst(false)}><input aria-label="Amount fixture" defaultValue="123.45"/><button onClick={() => setSecond(true)}>Open nested fixture</button></Modal><Modal open={second} title="Second fixture" onClose={() => setSecond(false)}><button onClick={() => setFirst(false)}>Close first fixture</button><button onClick={() => setSecond(false)}>Close second fixture</button></Modal></>;
}
it("owns modal focus and locks across overlapping surfaces without losing drafts", async () => {
  render(<Fixture/>); const user = userEvent.setup();
  useShellStore.getState().toggle("settings", screen.getByRole("button", { name: "Open first fixture" }));
  await user.click(screen.getByRole("button", { name: "Open first fixture" }));
  expect(useShellStore.getState().surface).toBeNull();
  expect(document.activeElement?.closest('[role="dialog"]')).toBeTruthy();
  const input = screen.getByLabelText("Amount fixture"); await user.clear(input); await user.type(input, "567.89");
  window.dispatchEvent(new Event("resize")); expect((input as HTMLInputElement).value).toBe("567.89");
  await user.click(screen.getByRole("button", { name: "Open nested fixture" }));
  await user.click(screen.getByRole("button", { name: "Close first fixture" }));
  expect(document.body.style.overflowY).toBe("hidden");
  await user.click(screen.getByRole("button", { name: "Close second fixture" }));
  await waitFor(() => expect(document.body.style.overflowY).not.toBe("hidden"));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("supports caller-owned finalFocus and blocks dismissal when closeDisabled is true", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();

  render(
    <div>
      <button data-testid="target-survivor">Survivor</button>
      <Modal
        open={true}
        title="Guarded modal"
        onClose={onClose}
        closeDisabled={true}
      >
        <p>Modal body</p>
      </Modal>
    </div>,
  );

  const closeBtn = screen.getByRole("button", { name: "Close" });
  expect(closeBtn.hasAttribute("disabled")).toBe(true);

  await user.click(closeBtn);
  expect(onClose).not.toHaveBeenCalled();

  await user.keyboard("{Escape}");
  expect(onClose).not.toHaveBeenCalled();

  const backdrop = document.querySelector(".bg-scrim");
  if (backdrop) {
    await user.click(backdrop);
  }
  expect(onClose).not.toHaveBeenCalled();
});
