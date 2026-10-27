import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { StudentsTable } from "./StudentsTable";
import type { StudentListItemResponse } from "../../lib/users/types";

afterEach(cleanup);

const mockStudents: StudentListItemResponse[] = [
  {
    id: 101,
    email: "sarah.connor@example.com",
    first_name: "Sarah",
    last_name: "Connor",
    role: "student",
    phone: "+992900000001",
    parent_phone: "+992900000002",
    date_of_birth: "2005-06-15",
    payment_day_of_month: 12,
    parent_linked: true,
    is_deleted: false,
    must_set_password: false,
    created_at: "2026-01-10T10:00:00Z",
    updated_at: "2026-01-10T10:00:00Z",
    photo_path: null,
    thumbnail_path: null,
    courses: [
      { course_id: 1, title: "Python", enrollment_id: 11, billing_mode: "paid" },
      { course_id: 2, title: "Design", enrollment_id: 12, billing_mode: "paid" },
      { course_id: 3, title: "Math", enrollment_id: 13, billing_mode: "paid" },
      { course_id: 4, title: "English", enrollment_id: 14, billing_mode: "grant" },
    ],
    debt_amount: "250.00",
    payment_status: "debt",
  },
  {
    id: 102,
    email: "john.reese@example.com",
    first_name: "John",
    last_name: "Reese",
    role: "student",
    phone: null,
    parent_phone: null,
    date_of_birth: null,
    payment_day_of_month: 25,
    parent_linked: false,
    is_deleted: true,
    must_set_password: false,
    created_at: "2026-02-14T11:00:00Z",
    updated_at: "2026-02-14T11:00:00Z",
    photo_path: null,
    thumbnail_path: null,
    courses: [],
    debt_amount: "0.00",
    payment_status: "ok",
  },
];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderTable(props: Partial<Parameters<typeof StudentsTable>[0]> = {}) {
  const defaultProps = {
    students: mockStudents,
    total: 2,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    search: "",
    hasActiveFilters: false,
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    onPageChange: vi.fn(),
    pageSizeOptions: [10, 20, 50, 100],
    onPageSizeChange: vi.fn(),
    onEdit: vi.fn(),
    onDeleteRequest: vi.fn(),
    onAddStudent: vi.fn(),
    onClearSearch: vi.fn(),
    onClearFilters: vi.fn(),
    ...props,
  };

  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/students"]}>
          <LocationProbe />
          <Routes>
            <Route path="/students" element={<StudentsTable {...defaultProps} />} />
            <Route path="/students/:id" element={<div>profile</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    ),
    props: defaultProps,
  };
}

describe("StudentsTable without an email", () => {
  it("shows the phone once when the student has no email", () => {
    const emailless: StudentListItemResponse = { ...mockStudents[0], id: 103, email: null, phone: "+992900000099", first_name: "Nodira" };
    renderTable({ students: [emailless], total: 1 });
    const row = document.getElementById("student-row-103") as HTMLElement;
    expect(within(row).getAllByText("+992900000099")).toHaveLength(1);
    expect(row.textContent).not.toContain("null");
  });
});

describe("StudentsTable", () => {
  it("shows the Telegram icon with a tooltip only for linked parents", () => {
    renderTable();
    const sarahRow = document.getElementById("student-row-101") as HTMLElement;
    const johnRow = document.getElementById("student-row-102") as HTMLElement;
    expect(within(sarahRow).getByRole("img", { name: "Parent linked in Telegram" }).getAttribute("title")).toBe("Parent linked in Telegram");
    expect(within(johnRow).queryByRole("img", { name: /Telegram/ })).toBeNull();
    expect(screen.getAllByRole("img", { name: /Telegram/ })).toHaveLength(1);
    expect(screen.queryByText("Not linked")).toBeNull();
  });

  it("hides the phone line on phones when there is no phone but keeps the dash on desktop", () => {
    renderTable();
    const dash = within(document.getElementById("student-row-102") as HTMLElement).getAllByText("—")[0];
    expect(dash.parentElement?.className).toContain("hidden md:block");
    const withPhone = within(document.getElementById("student-row-101") as HTMLElement).getByText("+992900000001");
    expect(withPhone.className).not.toContain("hidden");
  });

  it("hides the empty courses dash on phones", () => {
    renderTable();
    const dashes = within(document.getElementById("student-row-102") as HTMLElement).getAllByText("—");
    expect(dashes.some((dash) => dash.className.includes("hidden") && dash.className.includes("md:block"))).toBe(true);
  });

  it("lets course pills use the column width and keeps the full title", () => {
    renderTable();
    const pill = within(document.getElementById("student-row-101") as HTMLElement).getByText("Python");
    expect(pill.className).toContain("max-w-full");
    expect(pill.getAttribute("title")).toBe("Python");
  });

  it("renders each student as one row link with phone text and a menu button", async () => {
    const { props } = renderTable();

    const row = document.getElementById("student-row-101") as HTMLElement;
    const rowLink = within(row).getByRole("link", { name: /Sarah Connor/ });
    expect(rowLink.getAttribute("href")).toBe("/students/101");
    expect(within(row).getAllByRole("link")).toHaveLength(1);
    expect(within(row).getByText("+992900000001").className).toContain("tabular-nums");

    const menuButton = within(row).getByRole("button", { name: "Student actions: Sarah Connor" });
    const user = userEvent.setup();
    await user.click(menuButton);
    await user.click(await screen.findByRole("menuitem", { name: /Edit/i }));
    expect(props.onEdit).toHaveBeenCalledWith(mockStudents[0], menuButton);
  });

  it("has courses and balance columns and no payment day column", () => {
    renderTable();
    expect(screen.getByText("Courses")).toBeTruthy();
    expect(screen.getByText("Balance")).toBeTruthy();
    expect(screen.queryByText("Payment day")).toBeNull();
    expect(screen.queryByText(/^Day \d+/)).toBeNull();
    const archivedRow = document.getElementById("student-row-102") as HTMLElement;
    expect(within(archivedRow).getByText("Archived")).toBeDefined();
    const activeRow = document.getElementById("student-row-101") as HTMLElement;
    expect(within(activeRow).queryByText("Archived")).toBeNull();
  });

  it("renders at most two course pills and a +N overflow pill", () => {
    renderTable();
    const row = document.getElementById("student-row-101") as HTMLElement;
    expect(within(row).getByText("Python")).toBeTruthy();
    expect(within(row).getByText("Design")).toBeTruthy();
    expect(within(row).queryByText("Math")).toBeNull();
    const overflow = within(row).getByText("+2");
    expect(overflow.getAttribute("title")).toBe("Math, English");
  });

  it("renders the balance as debt, zero and grant", () => {
    const grantStudent: StudentListItemResponse = { ...mockStudents[1], id: 104, is_deleted: false, payment_status: "grant" };
    renderTable({ students: [...mockStudents, grantStudent], total: 3 });
    const debtText = within(document.getElementById("student-row-101") as HTMLElement).getByText("Debt 250 TJS");
    expect(debtText.className).toContain("text-destructive");
    expect(debtText.className).toContain("tabular-nums");
    expect(within(document.getElementById("student-row-102") as HTMLElement).getByText("0 TJS")).toBeTruthy();
    expect(within(document.getElementById("student-row-104") as HTMLElement).getByText("Grant")).toBeTruthy();
  });

  it("keeps fractional debt amounts exact and groups thousands", () => {
    const fractional: StudentListItemResponse = { ...mockStudents[0], id: 105, debt_amount: "1250.50" };
    renderTable({ students: [fractional], total: 1 });
    expect(screen.getByText("Debt 1 250.50 TJS")).toBeTruthy();
  });

  it("truncates the email on one line with a title", () => {
    renderTable();
    const email = document.getElementById("student-row-101")?.querySelector('[title="sarah.connor@example.com"]');
    expect(email).not.toBeNull();
    expect(email?.className).toContain("truncate");
  });

  it("records navigation when the row link is used but not when the menu is used", async () => {
    const onStudentNavigate = vi.fn();
    renderTable({ onStudentNavigate });
    const user = userEvent.setup();
    const row = document.getElementById("student-row-101") as HTMLElement;

    await user.click(within(row).getByRole("button", { name: "Student actions: Sarah Connor" }));
    expect(onStudentNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId("location").textContent).toBe("/students");
    await user.keyboard("{Escape}");

    await user.click(within(row).getByText("sarah.connor@example.com"));
    expect(onStudentNavigate).toHaveBeenCalledWith(mockStudents[0]);
    expect(screen.getByTestId("location").textContent).toBe("/students/101");
  });

  it("changes page size through the custom listbox instead of a native select", async () => {
    const { props, container } = renderTable({ pageSize: 20 });
    expect(container.querySelector("select")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Rows per page: 20 per page" }));
    const listbox = await screen.findByRole("listbox", { name: "Rows per page" });
    const options = within(listbox).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["10 per page", "20 per page", "50 per page", "100 per page"]);
    expect(options[1].getAttribute("aria-selected")).toBe("true");

    await user.click(options[2]);
    expect(props.onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("keeps the same single-column-capable row on phones without a nested scroll container", () => {
    renderTable();
    const row = document.getElementById("student-row-101") as HTMLElement;
    expect(within(row).getByText("sarah.connor@example.com")).toBeDefined();
    expect(within(row).getByText("Python")).toBeDefined();
    expect(row.parentElement?.className).not.toMatch(/overflow-(y-)?(auto|scroll)/);
    expect(document.querySelector("table")).toBeNull();
  });

  it("renders a loading skeleton with the row grid geometry", () => {
    const { container } = renderTable({ isLoading: true, students: [], total: 0 });

    expect(container.querySelectorAll('ul[aria-hidden="true"] > li')).toHaveLength(5);
    expect(container.querySelector("ul[aria-hidden='true'] .md\\:grid-cols-\\[minmax\\(0\\,2fr\\)_minmax\\(0\\,1fr\\)_minmax\\(0\\,2\\.2fr\\)_9rem\\]")).not.toBeNull();
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it("renders error state with working retry button", async () => {
    const onRetry = vi.fn();
    renderTable({ isError: true, students: [], total: 0, onRetry });

    const retryButtons = screen.getAllByRole("button", { name: /Retry/i });
    expect(retryButtons.length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(retryButtons[0]);
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders empty state with Add Student button when no students exist and search is empty", async () => {
    const onAddStudent = vi.fn();
    renderTable({ students: [], total: 0, search: "", onAddStudent });

    const addButtons = screen.getAllByRole("button", { name: /Add Student/i });
    expect(addButtons.length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(addButtons[0]);
    expect(onAddStudent).toHaveBeenCalled();
  });

  it("renders a filter-specific empty state with a working reset", async () => {
    const onClearFilters = vi.fn();
    renderTable({ students: [], total: 0, hasActiveFilters: true, onClearFilters });

    expect(screen.getByText("No students match")).toBeTruthy();
    expect(screen.getByText(/Reset them to see everyone/)).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Reset filters/i }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("renders empty state with Clear Search button when search returns zero results", async () => {
    const onClearSearch = vi.fn();
    renderTable({ students: [], total: 0, search: "nonexistent", onClearSearch });

    const clearButtons = screen.getAllByRole("button", { name: /Clear search/i });
    expect(clearButtons.length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(clearButtons[0]);
    expect(onClearSearch).toHaveBeenCalled();
  });

  it("retains empty accounts state with inline error banner when refresh fails after successful empty load", async () => {
    const onRetry = vi.fn();
    renderTable({
      students: [],
      total: 0,
      search: "",
      isLoading: false,
      isError: true,
      hasLoadedOnce: true,
      onRetry,
    });

    const errorAlert = screen.getByRole("alert");
    expect(errorAlert).toBeDefined();
    expect(screen.getByText("Failed to update list. Showing last loaded data.")).toBeDefined();

    const emptyHeadings = screen.getAllByText("No students yet");
    expect(emptyHeadings.length).toBeGreaterThan(0);

    const addButtons = screen.getAllByRole("button", { name: /Add Student/i });
    expect(addButtons.length).toBeGreaterThan(0);

    const retryButton = errorAlert.querySelector("button");
    expect(retryButton).not.toBeNull();
    const user = userEvent.setup();
    if (retryButton) {
      await user.click(retryButton);
      expect(onRetry).toHaveBeenCalledTimes(1);
    }
  });

  it("retains empty search results state with inline error banner when refresh fails after empty search", async () => {
    const onRetry = vi.fn();
    renderTable({
      students: [],
      total: 0,
      search: "NonexistentQuery",
      isLoading: false,
      isError: true,
      hasLoadedOnce: true,
      onRetry,
    });

    const errorAlert = screen.getByRole("alert");
    expect(errorAlert).toBeDefined();

    const emptyHeadings = screen.getAllByText("No students found");
    expect(emptyHeadings.length).toBeGreaterThan(0);
    expect(screen.getAllByText("No students match your search query").length).toBeGreaterThan(0);

    const clearButtons = screen.getAllByRole("button", { name: /Clear search/i });
    expect(clearButtons.length).toBeGreaterThan(0);

    const retryButton = errorAlert.querySelector("button");
    expect(retryButton).not.toBeNull();
    const user = userEvent.setup();
    if (retryButton) {
      await user.click(retryButton);
      expect(onRetry).toHaveBeenCalledTimes(1);
    }
  });
});
