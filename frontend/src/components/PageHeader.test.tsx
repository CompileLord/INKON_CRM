import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PageHeader } from "./PageHeader";

function renderHeader(element: ReactElement): void {
  render(<MemoryRouter>{element}</MemoryRouter>);
}

describe("PageHeader", () => {
  afterEach(cleanup);

  it("renders a single heading with count and actions and no back link on list pages", () => {
    renderHeader(<PageHeader title="Courses" count="(12)" actions={<button type="button">Add</button>} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Courses");
    expect(screen.getByText("(12)").className).toContain("tabular-nums");
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("renders exactly one back link pointing at the parent on detail pages", () => {
    renderHeader(<PageHeader backTo="/courses" backLabel="Courses" title="Algebra" />);
    const links: HTMLElement[] = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/courses");
    expect(links[0].textContent).toBe("Courses");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders only the back link when no title is given", () => {
    renderHeader(<PageHeader backTo="/x" backLabel="Back" />);
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
