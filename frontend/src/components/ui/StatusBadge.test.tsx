import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { StatusBadge } from "./Badge";

afterEach(() => cleanup());

describe("StatusBadge", () => {
  it("renders nothing for the normal active status", () => {
    const { container } = render(<StatusBadge status="active" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a badge for statuses that differ from normal", () => {
    render(<StatusBadge status="archived" />);
    expect(document.querySelector('[data-badge-status="archived"]')).not.toBeNull();
    cleanup();
    render(<StatusBadge status="completed" />);
    expect(screen.getByText(/./).getAttribute("data-badge-status")).toBe("completed");
  });
});
