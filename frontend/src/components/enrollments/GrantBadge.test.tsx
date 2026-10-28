import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import { CourseRosterRow } from "../courses/CourseRosterRow";
import { StudentCoursesTab } from "../student/StudentCoursesTab";
import { DebtorRow } from "../finance/DebtorRow";
import { debt } from "../../pages/FinanceTestSupport";
import { httpClient } from "../../lib/auth/httpClient";
import type { CourseRosterItem } from "../../lib/enrollments/types";
import type { StudentCourseProfile, User } from "../../lib/users/types";

vi.mock("../../lib/auth/httpClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/auth/httpClient")>();
  return { ...actual, httpClient: Object.assign(actual.httpClient, { get: vi.fn() }) };
});

const studentThree = { id: 3, first_name: "Zara", last_name: "Karimova", email: null, phone: null, photo_path: null, thumbnail_path: null } as unknown as User;

function rosterItem(billingMode: CourseRosterItem["billing_mode"]): CourseRosterItem {
  return {
    id: 1,
    enrollment_id: 11,
    student_id: 3,
    course_id: 5,
    price_at_enrollment: "800.00",
    color_hex: "#000000",
    enrolled_at: "2026-10-01T10:00:00Z",
    status: "active",
    billing_mode: billingMode,
    student: { id: 3, first_name: "Zara", last_name: "Karimova", email: "zara@example.com" },
  };
}

function renderWithProviders(children: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>{children}</MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

function renderRow(item: CourseRosterItem) {
  return renderWithProviders(
    <CourseRosterRow item={item} canOpenProfile canWithdraw canSwitchBillingMode isHighlighted={false} registerName={vi.fn()} onStudentOpen={vi.fn()} onWithdraw={vi.fn()} onSwitchBillingMode={vi.fn()} />,
  );
}

const profileCourse = {
  course: { id: 5, title: "Frontend", mentor_id: 2, start_date: "2026-11-01", end_date: "2027-03-31", price: "800.00", status: "active" },
  enrollment_status: "active",
  bucket: "active",
  periods_total: 0,
  periods_graded: 0,
} as unknown as StudentCourseProfile;

describe("GrantBadge placement", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });
  afterEach(() => cleanup());

  it("renders in the roster row for a grant and not for paid or a missing mode", () => {
    renderRow(rosterItem("grant"));
    expect(screen.getAllByTestId("grant-badge")[0].textContent).toBe("Grant");
    expect(screen.queryByText(/800 TJS/)).toBeNull();
    cleanup();
    renderRow(rosterItem("paid"));
    expect(screen.queryByTestId("grant-badge")).toBeNull();
    expect(screen.getAllByText(/800/).length).toBeGreaterThan(0);
    cleanup();
    renderRow(rosterItem(undefined));
    expect(screen.queryByTestId("grant-badge")).toBeNull();
  });

  it("offers the opposite switch in the roster row menu", () => {
    renderRow(rosterItem("grant"));
    expect(screen.getByRole("button", { name: /Zara Karimova/ })).toBeTruthy();
  });

  it("renders in the admin student profile course list from the enrollments", async () => {
    vi.mocked(httpClient.get).mockImplementation(async (url: string) => ({
      data: url.includes("payment-options")
        ? { wallet_credit: "0", enrollments: [{ enrollment_id: 11, course_id: 5, course_title: "Frontend", open_debt: "0", overdue_days: 0, remaining_contract_maximum: "0", billing_mode: "grant" }] }
        : { items: [], total: 0, page: 1, page_size: 100, total_pages: 1 },
    }));
    renderWithProviders(<StudentCoursesTab courses={[profileCourse]} student={studentThree} role="superadmin" currentUserId={1} />);
    expect((await screen.findByTestId("grant-badge")).textContent).toBe("Grant");
    expect(screen.queryByText(/800/)).toBeNull();
  });

  it("does not fetch balances or show the badge to a mentor viewing the profile", async () => {
    renderWithProviders(<StudentCoursesTab courses={[profileCourse]} student={studentThree} role="mentor" currentUserId={2} />);
    await waitFor(() => expect(screen.getByText("Frontend")).toBeTruthy());
    expect(vi.mocked(httpClient.get).mock.calls.some(([url]) => String(url).includes("payment-options"))).toBe(false);
    expect(screen.queryByTestId("grant-badge")).toBeNull();
  });

  it("renders in the finance debtors row for a grant only", () => {
    const grantDebt = { ...debt(7, 11, "Anisa", "Python Advanced", "700.10"), billing_mode: "grant" as const };
    const props = { rowKey: "k", showStudentNumber: false, canOpenProfile: false, isExpanded: false, onToggleDetails: vi.fn(), onAcceptPayment: vi.fn() };
    renderWithProviders(<ul><DebtorRow debt={grantDebt} {...props} /></ul>);
    expect(screen.getByTestId("grant-badge")).toBeTruthy();
    cleanup();
    renderWithProviders(<ul><DebtorRow debt={debt(7, 11, "Anisa", "Python Advanced", "700.10")} {...props} /></ul>);
    expect(screen.queryByTestId("grant-badge")).toBeNull();
  });
});

describe("journal surfaces never reveal grants", () => {
  const journalSources: Record<string, string> = {
    ...import.meta.glob("../journals/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
    ...import.meta.glob("../../lib/journals/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
    ...import.meta.glob("../../pages/Journal*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
  } as Record<string, string>;

  it("no journal component, page or library references the grant badge or billing mode", () => {
    const files: [string, string][] = Object.entries(journalSources).filter(([path]: [string, string]) => !/\.test\.|TestSupport|TestState/.test(path));
    expect(files.length).toBeGreaterThan(5);
    const offenders: string[] = files.filter(([, source]: [string, string]) => /GrantBadge|billing_mode|billingMode/.test(source)).map(([path]: [string, string]) => path);
    expect(offenders).toEqual([]);
  });
});
