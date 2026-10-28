import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import { AuthApiError } from "../../lib/auth/errors";
import { EnrollStudentModal } from "./EnrollStudentModal";
import * as endpoints from "../../lib/enrollments/endpoints";
import type { EligibleCandidateResponse, EnrollmentPreviewResponse, EnrollmentResponse } from "../../lib/enrollments/types";

vi.mock("../../lib/enrollments/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/enrollments/endpoints")>();
  return { ...actual, getEligibleCandidates: vi.fn(), previewEnrollment: vi.fn(), createEnrollment: vi.fn() };
});

const candidates: EligibleCandidateResponse[] = [
  { id: 1, first_name: "Aziza", last_name: "One", email: "aziza@example.com", phone: "+992900000001" },
  { id: 2, first_name: "Bakhtiyor", last_name: "Two", email: null, phone: "+992900000002" },
  { id: 3, first_name: "Charos", last_name: "Three", email: "charos@example.com", phone: null },
];
const paidPreview: EnrollmentPreviewResponse = {
  billing_mode: "paid",
  price_at_enrollment: "1200.00",
  billed_months: 5,
  total_amount: "6000.00",
  first_charge: { period_start: "2026-11-01", due_date: "2026-11-13", amount: "1200.00" },
};

function renderModal(onEnrolled: (id: number) => void, onClose: () => void = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <EnrollStudentModal open courseId={42} courseTitle="Frontend" coursePrice="1200.00" onClose={onClose} onEnrolled={onEnrolled} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

async function selectAll(): Promise<void> {
  for (const candidate of candidates) {
    fireEvent.click(await screen.findByRole("checkbox", { name: new RegExp(candidate.first_name) }));
  }
}

describe("EnrollStudentModal multi-select", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    vi.mocked(endpoints.getEligibleCandidates).mockResolvedValue({ items: candidates, total: 3, page: 1, page_size: 10, total_pages: 1 });
    vi.mocked(endpoints.previewEnrollment).mockResolvedValue(paidPreview);
    vi.mocked(endpoints.createEnrollment).mockImplementation(async (payload) => ({ id: payload.student_id, student_id: payload.student_id, course_id: 42 }) as EnrollmentResponse);
  });
  afterEach(() => cleanup());

  it("shows the selected count on the button and one contact line per candidate", async () => {
    renderModal(vi.fn());
    await selectAll();
    expect(screen.getByRole("button", { name: "Enroll 3" })).toBeTruthy();
    expect(screen.queryByText(/•/)).toBeNull();
    expect(screen.getByText("aziza@example.com")).toBeTruthy();
    expect(screen.queryByText(/\+992 ?90 ?000 ?00 ?01/)).toBeNull();
    const heading: HTMLElement = screen.getByText("Eligible candidates");
    expect(heading.className).not.toContain("uppercase");
    expect((await screen.findByTestId("enroll-preview")).textContent).toContain("Same for each of 3 students");
  });

  it("enrolls one request at a time and closes through onEnrolled when all succeed", async () => {
    const onEnrolled = vi.fn();
    renderModal(onEnrolled);
    await selectAll();
    fireEvent.click(screen.getByRole("button", { name: "Enroll 3" }));
    await waitFor(() => expect(onEnrolled).toHaveBeenCalledWith(3));
    expect(vi.mocked(endpoints.createEnrollment).mock.calls.map((call) => call[0].student_id)).toEqual([1, 2, 3]);
  });

  it("reports the failed student, keeps successes, and retries only the failed one", async () => {
    const onEnrolled = vi.fn();
    vi.mocked(endpoints.createEnrollment).mockImplementation(async (payload) => {
      if (payload.student_id === 2 && vi.mocked(endpoints.createEnrollment).mock.calls.length <= 3) throw new AuthApiError(409, "duplicate");
      return { id: payload.student_id, student_id: payload.student_id, course_id: 42 } as EnrollmentResponse;
    });
    renderModal(onEnrolled);
    await selectAll();
    fireEvent.click(screen.getByRole("button", { name: "Enroll 3" }));

    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("2 enrolled, 1 failed");
    const failedRow: HTMLElement = screen.getByRole("checkbox", { name: /Bakhtiyor/ }).closest("label") as HTMLElement;
    expect(within(failedRow).getByRole("alert").textContent).toBe("This student is already enrolled in this course.");
    expect(screen.getAllByText("Enrolled")).toHaveLength(2);
    expect((screen.getByRole("checkbox", { name: /Aziza/ }) as HTMLInputElement).disabled).toBe(true);
    expect(onEnrolled).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Enroll 1" }));
    await waitFor(() => expect(onEnrolled).toHaveBeenCalledWith(2));
    expect(vi.mocked(endpoints.createEnrollment).mock.calls.map((call) => call[0].student_id)).toEqual([1, 2, 3, 2]);
  });

  it("closing after a partial result reports the enrolled students instead of discarding them", async () => {
    const onEnrolled = vi.fn();
    const onClose = vi.fn();
    vi.mocked(endpoints.createEnrollment).mockImplementation(async (payload) => {
      if (payload.student_id === 3) throw new Error("boom");
      return { id: payload.student_id, student_id: payload.student_id, course_id: 42 } as EnrollmentResponse;
    });
    renderModal(onEnrolled, onClose);
    await selectAll();
    fireEvent.click(screen.getByRole("button", { name: "Enroll 3" }));
    expect(await screen.findByText("Failed to enroll student. Please try again.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).find((button: HTMLElement) => button.textContent === "Close") as HTMLElement);
    expect(onEnrolled).toHaveBeenCalledWith(2);
    expect(onClose).not.toHaveBeenCalled();
  });
});
