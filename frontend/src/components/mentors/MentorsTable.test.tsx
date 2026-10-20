import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { MentorsTable } from "./MentorsTable";
import type { User } from "../../lib/users/types";

afterEach(cleanup);

const mockMentors: User[] = [
  {
    id: 201,
    email: "dilshod.rahimov@example.com",
    first_name: "Dilshod",
    last_name: "Rahimov",
    role: "mentor",
    phone: "+992900000001",
    parent_phone: null,
    date_of_birth: "1988-04-12",
    payment_day_of_month: null,
    parent_telegram_chat_id: 54321,
    is_deleted: false,
    must_set_password: false,
    created_at: "2026-01-10T10:00:00Z",
    updated_at: "2026-01-10T10:00:00Z",
    photo_path: null,
    thumbnail_path: null,
  },
  {
    id: 202,
    email: "parvina.saidova@example.com",
    first_name: "Parvina",
    last_name: "Saidova",
    role: "mentor",
    phone: null,
    parent_phone: null,
    date_of_birth: null,
    payment_day_of_month: null,
    parent_telegram_chat_id: null,
    is_deleted: true,
    must_set_password: false,
    created_at: "2026-02-14T11:00:00Z",
    updated_at: "2026-02-14T11:00:00Z",
    photo_path: null,
    thumbnail_path: null,
  },
];

function renderTable(props: Partial<Parameters<typeof MentorsTable>[0]> = {}) {
  const defaultProps = {
    mentors: mockMentors,
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
    onAddMentor: vi.fn(),
    onClearSearch: vi.fn(),
    ...props,
  };

  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <MentorsTable {...defaultProps} />
        </MemoryRouter>
      </I18nextProvider>,
    ),
    props: defaultProps,
  };
}

describe("MentorsTable", () => {
  it("renders each teacher as one row link with phone text, archived badge only when archived, and a menu", async () => {
    const { props } = renderTable();

    const row = document.getElementById("mentor-row-201") as HTMLElement;
    const rowLink = within(row).getByRole("link", { name: /Dilshod Rahimov/ });
    expect(rowLink.getAttribute("href")).toBe("/mentors/201");
    expect(within(row).getAllByRole("link")).toHaveLength(1);
    expect(within(row).getByText("+992900000001").className).toContain("tabular-nums");
    expect(row.querySelector("[data-badge-status]")).toBeNull();
    expect((document.getElementById("mentor-row-202") as HTMLElement).querySelector("[data-badge-status='archived']")).not.toBeNull();

    const menuButton = within(row).getByRole("button", { name: "Teacher actions: Dilshod Rahimov" });
    const user = userEvent.setup();
    await user.click(menuButton);
    await user.click(await screen.findByRole("menuitem", { name: /Edit/i }));
    expect(props.onEdit).toHaveBeenCalledWith(mockMentors[0], menuButton);
  });

  it("omits paymentDay column and all student parent fields entirely", () => {
    renderTable();
    expect(screen.queryByText(/Payment day/i)).toBeNull();
    expect(screen.queryByText(/Parent/i)).toBeNull();
  });

  it("shows the email under the name and a dash when the phone is missing", () => {
    renderTable();
    const row = document.getElementById("mentor-row-202") as HTMLElement;
    expect(within(row).getByText("parvina.saidova@example.com")).toBeTruthy();
    expect(within(row).getByText("—")).toBeTruthy();
  });

  it("renders empty state for empty search query with Add Teacher action", async () => {
    const { props } = renderTable({ mentors: [], total: 0, search: "" });

    expect(screen.getAllByText("No teachers yet").length).toBeGreaterThan(0);
    const addButtons = screen.getAllByRole("button", { name: /Add Teacher/i });
    expect(addButtons.length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(addButtons[0]);
    expect(props.onAddMentor).toHaveBeenCalled();
  });

  it("renders empty state for active search query with Clear search action", async () => {
    const { props } = renderTable({ mentors: [], total: 0, search: "NonExistent" });

    expect(screen.getAllByText("No teachers found").length).toBeGreaterThan(0);
    const clearButtons = screen.getAllByRole("button", { name: /Clear search/i });
    expect(clearButtons.length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(clearButtons[0]);
    expect(props.onClearSearch).toHaveBeenCalled();
  });

  it("renders error state with retry button when initial load fails", async () => {
    const { props } = renderTable({ mentors: [], total: 0, isError: true, hasLoadedOnce: false });

    expect(screen.getAllByText("Failed to load data").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 of 0")).toBeNull();
    const retryButtons = screen.getAllByRole("button", { name: /Retry/i });
    expect(retryButtons.length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(retryButtons[0]);
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("retains loaded rows with inline error banner when background refetch fails", () => {
    renderTable({ isError: true, hasLoadedOnce: true });

    const alert = screen.getByRole("alert");
    expect(alert).toBeDefined();
    expect(screen.getByText("Failed to update list. Showing last loaded data.")).toBeDefined();
    expect(screen.getAllByRole("link", { name: /Dilshod Rahimov/ }).length).toBeGreaterThan(0);

    const retryButton = within(alert).getByRole("button", { name: /Retry/i });
    expect(retryButton).toBeTruthy();
  });

  it("uses the shared list geometry without a native table", () => {
    const { container } = renderTable();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelectorAll("[data-list-row]")).toHaveLength(2);
    const grid = container.querySelector("a > span.grid");
    expect(grid?.className).toContain("md:grid-cols-[");
  });
});
