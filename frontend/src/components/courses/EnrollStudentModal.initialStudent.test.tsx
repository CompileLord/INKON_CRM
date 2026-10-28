import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import { EnrollStudentModal } from "./EnrollStudentModal";
import * as enrollmentHooks from "../../lib/enrollments/hooks";
import type { EligibleCandidateResponse } from "../../lib/enrollments/types";

vi.mock("../../lib/enrollments/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/enrollments/hooks")>();
  return { ...actual, useEligibleCandidates: vi.fn(), useEnrollStudent: vi.fn(), useEnrollmentPreview: vi.fn() };
});

const newStudent: EligibleCandidateResponse = { id: 501, first_name: "Nilufar", last_name: "Rahimova", email: "n@example.com", phone: null, photo_path: null, thumbnail_path: null };
const otherCandidate: EligibleCandidateResponse = { id: 502, first_name: "Zara", last_name: "Karimova", email: null, phone: null, photo_path: null, thumbnail_path: null };

describe("EnrollStudentModal initialStudent", () => {
  let enrollAsync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    enrollAsync = vi.fn().mockResolvedValue({ id: 1 });
    vi.mocked(enrollmentHooks.useEnrollStudent).mockReturnValue({ mutateAsync: enrollAsync, isPending: false } as unknown as ReturnType<typeof enrollmentHooks.useEnrollStudent>);
    vi.mocked(enrollmentHooks.useEnrollmentPreview).mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof enrollmentHooks.useEnrollmentPreview>);
    vi.mocked(enrollmentHooks.useEligibleCandidates).mockReturnValue({
      data: { items: [otherCandidate], total: 1, page: 1, page_size: 10, total_pages: 1 },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof enrollmentHooks.useEligibleCandidates>);
  });
  afterEach(() => cleanup());

  function renderModal(onEnrolled: (id: number) => void = vi.fn()) {
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nextProvider i18n={i18n}>
          <EnrollStudentModal open courseId={42} courseTitle="Frontend" coursePrice="1200.00" initialStudent={newStudent} onClose={vi.fn()} onEnrolled={onEnrolled} />
        </I18nextProvider>
      </QueryClientProvider>,
    );
  }

  it("opens with the student preselected, listed with the other candidates, and fetches the list", () => {
    renderModal();
    const preselected = screen.getByRole("checkbox", { name: /Nilufar Rahimova/ }) as HTMLInputElement;
    expect(preselected.checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /Zara Karimova/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole("button", { name: "Change student" })).toBeNull();
    expect(screen.getByRole("button", { name: "Enroll 1" }).hasAttribute("disabled")).toBe(false);
    expect(vi.mocked(enrollmentHooks.useEligibleCandidates).mock.lastCall?.[2]).toBe(true);
  });

  it("enrolls the preselected student", async () => {
    const onEnrolled = vi.fn();
    renderModal(onEnrolled);
    fireEvent.click(screen.getByRole("button", { name: "Enroll 1" }));
    await waitFor(() => expect(enrollAsync).toHaveBeenCalledWith({ course_id: 42, student_id: 501, billing_mode: "paid", price_at_enrollment: "1200.00" }));
    await waitFor(() => expect(onEnrolled).toHaveBeenCalledWith(501));
  });
});
