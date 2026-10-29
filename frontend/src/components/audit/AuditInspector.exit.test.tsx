import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuditInspector } from "./AuditInspector";
import type { AuditEvent } from "../../lib/audit/api";
import "../../i18n";

vi.hoisted(() => Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) }));

afterEach(() => cleanup());

const event: AuditEvent = {
  id: 1, user_id: 5, actor_name: "Aziz Karimov", action: "update", entity_type: "course", entity_id: 9001, entity_label: "Python Advanced",
  student_id: null, course_id: 9, course_title: null, amount: null, created_at: new Date().toISOString(),
  changes: [{ id: 1, field_name: "price", old_value: "800.00", new_value: "850.50" }],
};

it("keeps the change details visible while the drawer slides out instead of emptying it", async () => {
  let finishExit: () => void = () => {};
  const exitFinished: Promise<void> = new Promise<void>((resolve) => { finishExit = resolve; });
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [{ finished: exitFinished, effect: { getTiming: () => ({ duration: 200, iterations: 1 }) } }] });
  try {
    const tree = (current: AuditEvent | null) => <MemoryRouter><AuditInspector event={current} onClose={() => undefined} onShowRecord={() => undefined} returnFocusTo={() => null} /></MemoryRouter>;
    const view = render(tree(event));
    const dialog: HTMLElement = await screen.findByRole("dialog");
    expect(within(dialog).getByText("850.50")).toBeTruthy();
    view.rerender(tree(null));
    await waitFor(() => expect(dialog.hasAttribute("data-ending-style")).toBe(true));
    expect(within(dialog).getByText("850.50")).toBeTruthy();
    await act(async () => { finishExit(); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  } finally {
    delete (Element.prototype as unknown as Record<string, unknown>).getAnimations;
  }
});
