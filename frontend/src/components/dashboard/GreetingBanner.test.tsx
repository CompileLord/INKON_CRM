import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { GreetingBanner } from "./GreetingBanner";

vi.mock("../students/StudentFormPanel", () => ({
  StudentFormPanel: ({ open }: { open: boolean }) => (open ? <div role="dialog">student create drawer</div> : null),
}));

describe("GreetingBanner", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => cleanup());

  it("offers the payment action and opens the student create drawer", () => {
    const onAcceptPayment = vi.fn();
    render(
      <MemoryRouter>
        <GreetingBanner onAcceptPayment={onAcceptPayment} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept Payment" }));
    expect(onAcceptPayment).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Add student" }));
    expect(screen.getByRole("dialog").textContent).toBe("student create drawer");
  });
});
