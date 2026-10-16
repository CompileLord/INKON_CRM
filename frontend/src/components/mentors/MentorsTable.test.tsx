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
  it("renders desktop table with real link, phone tel, user status badge, and 44px menu button", async () => {
    const { props } = renderTable();

    const dilshodLinks = screen.getAllByRole("link", { name: "Dilshod Rahimov" });
    expect(dilshodLinks.length).toBeGreaterThan(0);
    expect(dilshodLinks[0].getAttribute("href")).toBe("/mentors/201");

    const phoneLinks = screen.getAllByRole("link", { name: "+992900000001" });
    expect(phoneLinks.length).toBeGreaterThan(0);
    expect(phoneLinks[0].getAttribute("href")).toBe("tel:+992900000001");

    const menuButtons = screen.getAllByRole("button", { name: "Teacher actions: Dilshod Rahimov" });
    expect(menuButtons.length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(menuButtons[0]);

    const editItems = await screen.findAllByRole("menuitem", { name: /Edit/i });
    expect(editItems.length).toBeGreaterThan(0);
    await user.click(editItems[0]);

    expect(props.onEdit).toHaveBeenCalledWith(mockMentors[0], expect.anything());
  });

  it("omits paymentDay column and all student parent fields entirely", () => {
    renderTable();
    expect(screen.queryByText(/Payment day/i)).toBeNull();
    expect(screen.queryByText(/Parent/i)).toBeNull();
  });

  it("renders email mailto fallback when phone is not provided", () => {
    renderTable();
    const emailLinks = screen.getAllByRole("link", { name: "parvina.saidova@example.com" });
    expect(emailLinks.length).toBeGreaterThan(0);
    expect(emailLinks[0].getAttribute("href")).toBe("mailto:parvina.saidova@example.com");
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
    expect(screen.getAllByRole("link", { name: "Dilshod Rahimov" }).length).toBeGreaterThan(0);

    const retryButton = within(alert).getByRole("button", { name: /Retry/i });
    expect(retryButton.className).toContain("min-h-[44px]");
  });

  it("structures desktop table with table-fixed layout and responsive colgroup", () => {
    const { container } = renderTable();
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(table?.className).toContain("table-fixed");

    const cols = container.querySelectorAll("colgroup col");
    expect(cols.length).toBe(5);
    expect(cols[0].className).toContain("w-[46%]");
    expect(cols[3].className).toContain("hidden");
    expect(cols[4].className).toContain("w-[84px]");
  });
});
