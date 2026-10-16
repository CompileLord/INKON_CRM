import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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
    is_deleted: true,
    must_set_password: false,
    created_at: "2026-02-14T11:00:00Z",
    updated_at: "2026-02-14T11:00:00Z",
    photo_path: null,
    thumbnail_path: null,
  },
];

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
    onEdit: vi.fn(),
    onDeleteRequest: vi.fn(),
    onAddStudent: vi.fn(),
    onClearSearch: vi.fn(),
    ...props,
  };

  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <StudentsTable {...defaultProps} />
        </MemoryRouter>
      </I18nextProvider>,
    ),
    props: defaultProps,
  };
}

describe("StudentsTable", () => {
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

  it("renders email fallback when student has no phone in phone card view", () => {
    renderTable();

    const fallbackEmailLinks = screen.getAllByRole("link", { name: "john.reese@example.com" });
    expect(fallbackEmailLinks.length).toBeGreaterThan(0);
    expect(fallbackEmailLinks[0].getAttribute("href")).toBe("mailto:john.reese@example.com");
  });

  it("renders loading skeleton in table and mobile layouts", () => {
    const { container } = renderTable({ isLoading: true, students: [], total: 0 });

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
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
