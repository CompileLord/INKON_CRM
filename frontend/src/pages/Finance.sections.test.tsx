import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureFinanceMocks, debtsUrl, location, mock, page, payment, paymentsUrl, renderFinance, requests } from "./FinanceTestSupport";

beforeEach(async () => {
  await configureFinanceMocks();
});
afterEach(() => cleanup());

describe("Course balance action", () => {
  it("is a quiet ghost Pay action with the full accessible name, 44px target and no border", async () => {
    renderFinance();
    await screen.findAllByText("Python Advanced");
    const balances = screen.getByRole("region", { name: "Largest debts" });
    const action = within(balances).getByRole("button", { name: "Accept payment for Anisa Karimova, Python Advanced" });
    expect(action.textContent).toBe("Pay");
    expect(action.className).toContain("min-h-11");
    expect(action.className).toContain("text-maroon-text");
    expect(action.className).not.toMatch(/(^|\s)border(\s|$)/);
    expect(action.className).not.toContain("bg-card");
    expect(within(balances).queryByText("Accept Payment")).toBeNull();
  });
});

describe("Latest payments identity", () => {
  it("leads with the student's name and demotes the payment reference", async () => {
    renderFinance();
    const latest = screen.getByRole("region", { name: "Latest payments" });
    expect(await within(latest).findByText("Dilnoza Rustamova")).toBeTruthy();
    expect(within(latest).queryByText(/Payment #/)).toBeNull();
    expect(within(latest).getByText("First Course")).toBeTruthy();
    expect(within(latest).getByText("Cash")).toBeTruthy();
    expect(within(latest).queryByText(/Student #/)).toBeNull();
  });

  it("falls back to a translated Unknown student when both name parts are missing", async () => {
    mock.onGet(paymentsUrl).reply(200, page([{ ...payment, student_first_name: null, student_last_name: null }]));
    renderFinance();
    const latest = screen.getByRole("region", { name: "Latest payments" });
    expect(await within(latest).findByText("Unknown student")).toBeTruthy();
    expect(within(latest).queryByText(/Student #7/)).toBeNull();
  });

  it("adds the student number only when two visible payers share a name", async () => {
    mock.onGet(paymentsUrl).reply(200, page([payment, { ...payment, id: 124, student_id: 9 }]));
    renderFinance();
    const latest = screen.getByRole("region", { name: "Latest payments" });
    await within(latest).findAllByText("Dilnoza Rustamova");
    expect(within(latest).getByText("Student #7")).toBeTruthy();
    expect(within(latest).getByText("Student #9")).toBeTruthy();
  });
});

describe("Finance motion and controls", () => {
  it("crossfades tab panels over 200ms with a fresh panel per tab and uses no native select", async () => {
    renderFinance();
    await screen.findAllByText("Anisa Karimova");
    const overviewPanel = screen.getByRole("tabpanel");
    expect(overviewPanel.className).toContain("duration-200");
    expect(overviewPanel.className).toContain("starting:opacity-0");
    await userEvent.click(screen.getByRole("tab", { name: "Debtors" }));
    const debtorsPanel = screen.getByRole("tabpanel");
    expect(debtorsPanel).not.toBe(overviewPanel);
    expect(debtorsPanel.className).toContain("duration-200");
    expect(document.querySelector("select")).toBeNull();
  });

  it("opens the range popover with a 150ms opacity and scale arrival from its anchor", async () => {
    renderFinance();
    const summary = screen.getByRole("region", { name: "Finance summary" });
    await userEvent.click(within(summary).getByRole("button", { name: /^Collection period:/ }));
    const popup = (await screen.findByText("Collection period", { selector: "[id]" })).closest("[class*='origin-']") as HTMLElement;
    expect(popup.className).toContain("duration-150");
    expect(popup.className).toContain("origin-[var(--transform-origin)]");
    expect(popup.className).toContain("data-[starting-style]:opacity-0");
    expect(popup.className).toContain("motion-safe:data-[starting-style]:scale-[0.96]");
  });
});

describe("Debtors course handoff", () => {
  it("labels a validated course filter as course debts, sends only course_id and clears it", async () => {
    renderFinance("/finance?tab=debtors&dcourse=11");
    expect(await screen.findByText("Course debts: Python Advanced")).toBeTruthy();
    const request = requests(debtsUrl)[0];
    expect(request.url).toContain("course_id=11");
    expect(request.url).not.toContain("student_id");
    await userEvent.click(screen.getByRole("button", { name: "Clear the course filter" }));
    expect(location()).toBe("/finance?tab=debtors");
    expect(screen.queryByText(/Course debts:/)).toBeNull();
  });

  it("falls back to the course number when no returned row names the course", async () => {
    mock.onGet(debtsUrl).reply(200, page([]));
    renderFinance("/finance?tab=debtors&dcourse=99");
    expect(await screen.findByText("Course debts: Course #99")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear the course filter" })).toBeTruthy();
  });

  it("moves to the last valid page when the requested page no longer exists", async () => {
    mock.onGet(debtsUrl).reply(200, { items: [], total: 4, page: 9, page_size: 20, total_pages: 1 });
    renderFinance("/finance?tab=debtors&dpage=9");
    await waitFor(() => expect(location()).toBe("/finance?tab=debtors"));
  });
});

describe("Accountant containment", () => {
  it("renders no student, course or profile links anywhere on the finance page", async () => {
    renderFinance();
    await screen.findAllByText("Anisa Karimova");
    for (const link of screen.queryAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/\/(students|courses|mentors)/);
    }
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

