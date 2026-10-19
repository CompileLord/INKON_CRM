import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { StudentsTable } from "./StudentsTable";
import type { User } from "../../lib/users/types";

afterEach(cleanup);

const mockStudents: User[] = [
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
    parent_telegram_chat_id: 12345,
    parent_linked: true,
    is_deleted: false,
    must_set_password: false,
    created_at: "2026-01-10T10:00:00Z",
    updated_at: "2026-01-10T10:00:00Z",
    photo_path: null,
    thumbnail_path: null,
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
    parent_telegram_chat_id: null,
    parent_linked: false,
    is_deleted: true,
    must_set_password: false,
    created_at: "2026-02-14T11:00:00Z",
    updated_at: "2026-02-14T11:00:00Z",
    photo_path: null,
    thumbnail_path: null,
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

describe("StudentsTable", () => {
  it("shows the parent-linked badge only for students whose parent has linked Telegram", () => {
    renderTable();
    const desktop = screen.getAllByText("Parent linked");
    expect(desktop.length).toBeGreaterThan(0);
    expect(screen.getAllByText("Parent not linked").length).toBeGreaterThan(0);
    const sarahRow = document.getElementById("student-row-101") as HTMLElement;
    const johnRow = document.getElementById("student-row-102") as HTMLElement;
    expect(within(sarahRow).getByText("Parent linked")).toBeTruthy();
    expect(within(johnRow).getByText("Parent not linked")).toBeTruthy();
  });

  it("renders desktop table with real link, phone tel, tabular payment day, and 44px menu button", async () => {
    const { props } = renderTable();

    const sarahLinks = screen.getAllByRole("link", { name: "Sarah Connor" });
    expect(sarahLinks.length).toBeGreaterThan(0);
    expect(sarahLinks[0].getAttribute("href")).toBe("/students/101");

    const phoneLinks = screen.getAllByRole("link", { name: "+992900000001" });
    expect(phoneLinks.length).toBeGreaterThan(0);
    expect(phoneLinks[0].getAttribute("href")).toBe("tel:+992900000001");

    const menuButtons = screen.getAllByRole("button", { name: "Student actions: Sarah Connor" });
    expect(menuButtons.length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(menuButtons[0]);

    const editItems = await screen.findAllByRole("menuitem", { name: /Edit/i });
    expect(editItems.length).toBeGreaterThan(0);
    await user.click(editItems[0]);

    expect(props.onEdit).toHaveBeenCalledWith(mockStudents[0], expect.anything());
  });

  it("shows a single student phone per row with no phone labels and the guardian phone only inside the popover", async () => {
    renderTable();

    expect(screen.queryByText("Student phone")).toBeNull();
    expect(screen.queryByText("Guardian phone")).toBeNull();
    expect(screen.queryByText("+992900000002")).toBeNull();

    const user = userEvent.setup();
    const triggers = screen.getAllByRole("button", { name: "Guardian phone" });
    expect(triggers.length).toBeGreaterThan(0);
    await user.click(triggers[0]);

    const guardianLink = await screen.findByRole("link", { name: "+992900000002" });
    expect(guardianLink.getAttribute("href")).toBe("tel:+992900000002");
    expect(guardianLink.className).toContain("tabular-nums");
  });

  it("renders no guardian trigger for a student without a guardian phone", () => {
    renderTable({ students: [mockStudents[1]], total: 1 });
    expect(screen.queryAllByRole("button", { name: "Guardian phone" })).toHaveLength(0);
  });

  it("renders the payment day as a chip and shows no status pill for active students", () => {
    renderTable();

    expect(screen.getAllByText("Day 12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Day 25").length).toBeGreaterThan(0);

    const activeRow = document.getElementById("student-row-101") as HTMLElement;
    expect(within(activeRow).queryByText("Active")).toBeNull();
    expect(within(activeRow).queryByText("Archived")).toBeNull();

    const archivedRow = document.getElementById("student-row-102") as HTMLElement;
    expect(within(archivedRow).getByText("Archived")).toBeDefined();
    expect(screen.queryAllByText("Active")).toHaveLength(0);
  });

  it("explains the payment day in the column header tooltip", async () => {
    renderTable();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Payment day" }));
    expect(await screen.findByRole("tooltip")).toHaveProperty(
      "textContent",
      "The day of each month when this student's payment is due.",
    );
  });

  it("truncates the email on one line with a title", () => {
    renderTable();
    const email = document.getElementById("student-row-101")?.querySelector('[title="sarah.connor@example.com"]');
    expect(email).not.toBeNull();
    expect(email?.className).toContain("truncate");
  });

  it("opens the profile when the row is clicked but not when the phone link or menu is used", async () => {
    const onStudentNavigate = vi.fn();
    renderTable({ onStudentNavigate });
    const user = userEvent.setup();
    const row = document.getElementById("student-row-101") as HTMLElement;

    await user.click(within(row).getByRole("link", { name: "+992900000001" }));
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

  it("renders mobile cards with name, email, phone and payment chip and no nested vertical scroll", () => {
    renderTable();
    const card = document.getElementById("student-card-101") as HTMLElement;
    expect(within(card).getByRole("link", { name: "Sarah Connor" })).toBeDefined();
    expect(within(card).getByText("sarah.connor@example.com")).toBeDefined();
    expect(within(card).getByRole("link", { name: "+992900000001" })).toBeDefined();
    expect(within(card).getByText("Day 12")).toBeDefined();
    expect(card.parentElement?.className).not.toMatch(/overflow-(y-)?(auto|scroll)/);
    expect(document.querySelector("table")?.parentElement?.className).not.toMatch(/overflow-(y-)?(auto|scroll)/);
  });

  it("renders loading skeleton in table and mobile layouts", () => {
    const { container } = renderTable({ isLoading: true, students: [], total: 0 });

    const desktopSkeletonRows = container.querySelectorAll("tbody tr.h-\\[60px\\]");
    expect(desktopSkeletonRows).toHaveLength(5);
    expect(container.querySelectorAll('.lg\\:hidden [aria-hidden="true"]')).toHaveLength(4);
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

    const emptyHeadings = screen.getAllByRole("heading", { name: "No students yet" });
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

    const emptyHeadings = screen.getAllByRole("heading", { name: "No students found" });
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
