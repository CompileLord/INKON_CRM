import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { PhoneInput } from "./PhoneInput";

afterEach(() => cleanup());

describe("PhoneInput", () => {
  it("renders a tel field with a placeholder and no separate format hint", () => {
    const { container } = render(<PhoneInput label="Phone" />);
    const input: HTMLInputElement = screen.getByLabelText("Phone");
    expect(input.type).toBe("tel");
    expect(input.inputMode).toBe("tel");
    expect(input.placeholder).toBe("+992901234567");
    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/Format|Формат/);
  });

  it("shows error text only when an error is given and links it to the field", () => {
    render(<PhoneInput label="Phone" error="Use international format, starting with +" />);
    const input: HTMLInputElement = screen.getByLabelText("Phone");
    const alert: HTMLElement = screen.getByRole("alert");
    expect(alert.textContent).toBe("Use international format, starting with +");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("forwards its ref to the input", () => {
    let element: HTMLInputElement | null = null;
    render(<PhoneInput label="Phone" ref={(node) => { element = node; }} />);
    expect(element).toBe(screen.getByLabelText("Phone"));
  });
});
