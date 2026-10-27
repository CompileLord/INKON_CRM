import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { StatsRow } from "./StatsRow";

vi.mock("../../lib/finance/hooks", () => ({
  useFinanceAnalytics: () => ({ data: { net_receivable: "1200.00", unpaid_students_count: 4 }, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("../../lib/courses/hooks", () => ({
  useCourses: () => ({ data: { total: 7 }, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("../../lib/users/hooks", () => ({
  useStudents: () => ({ data: { total: 120 }, isLoading: false, isError: false, refetch: vi.fn() }),
}));

describe("StatsRow", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => cleanup());

  it("links each tile to its list without inventing metrics", () => {
    render(
      <MemoryRouter>
        <StatsRow />
      </MemoryRouter>,
    );
    const links: HTMLAnchorElement[] = screen.getAllByRole("link") as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/finance?tab=debtors", "/courses", "/students"]);
    expect(links[0].textContent).toContain("Outstanding debt");
    expect(links[0].textContent).toContain("4 debtors");
    expect(links[1].textContent).toContain("7");
    expect(links[2].textContent).toContain("120");
  });
});
