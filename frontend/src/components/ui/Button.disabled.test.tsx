import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { Button } from "./Button";

afterEach(() => cleanup());

describe("Button disabled state", () => {
  it("styles a disabled primary differently from a disabled secondary", () => {
    render(<><Button disabled>Primary</Button><Button variant="secondary" disabled>Secondary</Button></>);
    const primary: string = screen.getByRole("button", { name: "Primary" }).className;
    const secondary: string = screen.getByRole("button", { name: "Secondary" }).className;
    expect(primary).toContain("disabled:border-dashed");
    expect(primary).toContain("disabled:bg-strip");
    expect(secondary).not.toContain("disabled:border-dashed");
  });

  it("explains why a disabled button is disabled in a tooltip", () => {
    render(<Button disabled disabledReason="Select a student">Enroll</Button>);
    const anchor: HTMLElement = screen.getByRole("button", { name: "Enroll" }).parentElement as HTMLElement;
    fireEvent.focus(anchor);
    expect(screen.getByRole("tooltip").textContent).toBe("Select a student");
  });

  it("shows no tooltip when the button is enabled", () => {
    render(<Button disabledReason="Select a student">Enroll</Button>);
    expect(screen.getByRole("button", { name: "Enroll" }).parentElement).toBe(document.body.firstElementChild);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
