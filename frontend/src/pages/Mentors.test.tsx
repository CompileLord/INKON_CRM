import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { useAuthStore } from "../store/authStore";
import { Mentors } from "./Mentors";
import { MentorProfile } from "./MentorProfile";
import * as userHooks from "../lib/users/hooks";
import type { PaginatedUsers, MentorProfileResponse, User } from "../lib/users/types";
import {
  clearSavedMentorsReturnContext,
  getSavedMentorsReturnContext,
} from "../lib/users/returnContext";

beforeEach(() => {
  useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 1 });
  clearSavedMentorsReturnContext();
  vi.spyOn(userHooks, "useMentorProfile").mockReturnValue({
    data: undefined, isLoading: false, isError: true, refetch: vi.fn(),
  } as unknown as ReturnType<typeof userHooks.useMentorProfile>);
  vi.spyOn(userHooks, "useMentorAnalytics").mockReturnValue({
    data: undefined, isLoading: false, isError: true, refetch: vi.fn(),
  } as unknown as ReturnType<typeof userHooks.useMentorAnalytics>);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mockMentorsList: User[] = [
  {
    id: 21,
    email: "mentor21@example.com",
    first_name: "Alisher",
    last_name: "Navoiy",
    role: "mentor",
    phone: "+992900000021",
    parent_phone: null,
    date_of_birth: "1980-02-09",
    payment_day_of_month: null,
    parent_telegram_chat_id: 201,
    is_deleted: false,
    must_set_password: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    photo_path: null,
    thumbnail_path: null,
  },
  {
    id: 22,
    email: "mentor22@example.com",
    first_name: "Zarina",
    last_name: "Kamilova",
    role: "mentor",
    phone: "+992900000022",
    parent_phone: null,
    date_of_birth: null,
    payment_day_of_month: null,
    parent_telegram_chat_id: null,
    is_deleted: false,
    must_set_password: false,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    photo_path: null,
    thumbnail_path: null,
  },
];

const mockPaginatedData: PaginatedUsers<User> = {
  items: mockMentorsList,
  total: 2,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

function renderMentorsPage(initialEntries = ["/mentors"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  let capturedLocation: ReturnType<typeof useLocation> | null = null;
  let capturedNavigate: ReturnType<typeof useNavigate> | null = null;

  function LocationObserver() {
    capturedLocation = useLocation();
    capturedNavigate = useNavigate();
    return (
      <button
        type="button"
        data-testid="nav-courses-btn"
        onClick={() => capturedNavigate?.("/courses")}
      >
        Go to courses
      </button>
    );
  }

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={initialEntries}>
          <LocationObserver />
          <Routes>
            <Route path="/mentors" element={<Mentors />} />
            <Route path="/mentors/:id" element={<MentorProfile />} />
            <Route path="/courses" element={<div>Courses Page</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );

  return {
    ...renderResult,
    getLocation: () => capturedLocation,
    getNavigate: () => capturedNavigate,
  };
}

describe("Mentors directory page", () => {
  it("renders directory title, total counter, search input, and mentors list", () => {
    vi.spyOn(userHooks, "useMentors").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useMentors>);

    renderMentorsPage();

    expect(screen.getByRole("heading", { name: "Teachers" })).toBeDefined();
    expect(screen.getByText(/Total: 2/i)).toBeDefined();
    expect(screen.getByRole("searchbox")).toBeDefined();
    expect(screen.getAllByRole("link", { name: "Alisher Navoiy" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Zarina Kamilova" }).length).toBeGreaterThan(0);
  });

  it("omits paymentDay column and all student parent fields from directory table", () => {
    vi.spyOn(userHooks, "useMentors").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useMentors>);

    renderMentorsPage();

    expect(screen.queryByText(/Payment day/i)).toBeNull();
    expect(screen.queryByText(/Parent/i)).toBeNull();
  });

  it("synchronizes search input with URL search params", async () => {
    vi.spyOn(userHooks, "useMentors").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useMentors>);

    const { getLocation } = renderMentorsPage();
    const user = userEvent.setup();

    const searchInput = screen.getByRole("searchbox");
    await user.type(searchInput, "Alisher");

    await waitFor(() => {
      expect(getLocation()?.search).toContain("q=Alisher");
    });
  });

  it("resets page to 1 when changing page size", async () => {
    vi.spyOn(userHooks, "useMentors").mockReturnValue({
      data: { ...mockPaginatedData, total: 100, total_pages: 5, page: 2 },
      isLoading: false,
      isFetching: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useMentors>);

    const { getLocation } = renderMentorsPage(["/mentors?page=2&pageSize=20"]);
    const user = userEvent.setup();

    const pageSizeSelect = screen.getByRole("combobox", { name: /Page/i });
    await user.selectOptions(pageSizeSelect, "50");

    await waitFor(() => {
      expect(getLocation()?.search).toContain("pageSize=50");
      expect(getLocation()?.search).toContain("page=1");
    });
  });

  it("records mentors navigation context when navigating to mentor profile", async () => {
    vi.spyOn(userHooks, "useMentors").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useMentors>);

    const { getLocation } = renderMentorsPage();
    const user = userEvent.setup();

    const alisherLink = screen.getAllByRole("link", { name: "Alisher Navoiy" })[0];
    await user.click(alisherLink);

    await waitFor(() => {
      expect(getLocation()?.pathname).toBe("/mentors/21");
    });

    const ctx = getSavedMentorsReturnContext("superadmin");
    expect(ctx).not.toBeNull();
    expect(ctx?.mentorId).toBe(21);
    expect(ctx?.page).toBe(1);
  });

  it("opens newly created mentor profile on successful creation with creation banner", async () => {
    vi.spyOn(userHooks, "useMentors").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useMentors>);

    const newMentor: User = {
      id: 99,
      email: "new.mentor@example.com",
      first_name: "Rustam",
      last_name: "Shoev",
      role: "mentor",
      phone: "+992900000099",
      parent_phone: null,
      date_of_birth: null,
      payment_day_of_month: null,
      parent_telegram_chat_id: null,
      is_deleted: false,
      must_set_password: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
      photo_path: null,
      thumbnail_path: null,
    };

    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(newMentor),
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);

    vi.spyOn(userHooks, "useMentorProfile").mockReturnValue({
      data: {
        user: newMentor,
        active_courses: [],
        active_students_count: 0,
        avg_score: 0,
      } as unknown as MentorProfileResponse,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useMentorProfile>);

    vi.spyOn(userHooks, "useMentorAnalytics").mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof userHooks.useMentorAnalytics>);

    const { getLocation } = renderMentorsPage();
    const user = userEvent.setup();

    const addMentorBtn = screen.getByRole("button", { name: /Add Teacher/i });
    await user.click(addMentorBtn);

    expect(screen.getByRole("heading", { name: "New Teacher" })).toBeDefined();

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/First Name/i), "Rustam");
    await user.type(within(dialog).getByLabelText(/Last Name/i), "Shoev");
    await user.type(within(dialog).getByLabelText(/Email/i), "new.mentor@example.com");

    const submitBtn = within(dialog).getByRole("button", { name: "Create" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(getLocation()?.pathname).toBe("/mentors/99");
      expect(screen.getByRole("status").textContent).toContain("Teacher created. Login details (email and temporary password) were sent to their email");
    });
  });

  it("handles deletion workflow truthfully naming mentor and describing assignment impact", async () => {
    const refetchSpy = vi.fn();
    vi.spyOn(userHooks, "useMentors").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      isPlaceholderData: false,
      refetch: refetchSpy,
    } as unknown as ReturnType<typeof userHooks.useMentors>);

    const deleteSpy = vi.fn().mockResolvedValue(true);
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);

    renderMentorsPage();
    const user = userEvent.setup();

    const menuButton = screen.getAllByRole("button", {
      name: "Teacher actions: Alisher Navoiy",
    })[0];
    await user.click(menuButton);

    const deleteItem = await screen.findByRole("menuitem", { name: /Delete/i });
    await user.click(deleteItem);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete Teacher")).toBeDefined();
    expect(
      within(dialog).getByText(
        /Deleting Alisher Navoiy will deactivate the teacher account and revoke active sessions\. Existing course assignments remain assigned and will need manual reassignment/i,
      ),
    ).toBeDefined();

    const confirmDeleteBtn = within(dialog).getByRole("button", { name: "Delete" });
    await user.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(21);
    });

    await waitFor(() => {
      expect(refetchSpy).toHaveBeenCalled();
    });
  });

  it("retains delete failure message on dialog when delete fails", async () => {
    vi.spyOn(userHooks, "useMentors").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useMentors>);

    const deleteSpy = vi.fn().mockRejectedValue(new Error("Server error"));
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);

    renderMentorsPage();
    const user = userEvent.setup();

    const menuButton = screen.getAllByRole("button", {
      name: "Teacher actions: Alisher Navoiy",
    })[0];
    await user.click(menuButton);

    const deleteItem = await screen.findByRole("menuitem", { name: /Delete/i });
    await user.click(deleteItem);

    const dialog = screen.getByRole("dialog");
    const confirmDeleteBtn = within(dialog).getByRole("button", { name: "Delete" });
    await user.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(
        within(dialog).getByText(
          "Failed to delete teacher account. The teacher was not deleted.",
        ),
      ).toBeDefined();
    });
  });

  it("reconciles pagination when page is out of range", async () => {
    vi.spyOn(userHooks, "useMentors").mockReturnValue({
      data: {
        items: [],
        total: 15,
        page: 3,
        page_size: 20,
        total_pages: 1,
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useMentors>);

    const { getLocation } = renderMentorsPage(["/mentors?page=3&pageSize=20"]);

    await waitFor(() => {
      expect(getLocation()?.search).toContain("page=1");
    });
  });

  it("prevents stale profile navigation when user navigates away before late create completion resolves", async () => {
    vi.spyOn(userHooks, "useMentors").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useMentors>);

    let resolveCreate: (user: User) => void = () => {};
    const createPromise = new Promise<User>((resolve) => {
      resolveCreate = resolve;
    });

    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: vi.fn().mockReturnValue(createPromise),
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);

    const { getLocation } = renderMentorsPage();
    const user = userEvent.setup();

    const addMentorBtn = screen.getByRole("button", { name: /Add Teacher/i });
    await user.click(addMentorBtn);

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/First Name/i), "Farrukh");
    await user.type(within(dialog).getByLabelText(/Last Name/i), "Deferred");
    await user.type(within(dialog).getByLabelText(/Email/i), "farrukh.deferred@example.com");

    const submitBtn = within(dialog).getByRole("button", { name: "Create" });
    await user.click(submitBtn);

    const navCoursesBtn = screen.getByTestId("nav-courses-btn");
    await user.click(navCoursesBtn);

    expect(getLocation()?.pathname).toBe("/courses");

    resolveCreate({
      ...mockMentorsList[0],
      id: 777,
      email: "farrukh.deferred@example.com",
    });

    await waitFor(() => {
      expect(getLocation()?.pathname).toBe("/courses");
    });
  });
});
