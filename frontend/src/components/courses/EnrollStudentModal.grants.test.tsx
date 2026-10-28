import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import { EnrollStudentModal } from "./EnrollStudentModal";
import * as endpoints from "../../lib/enrollments/endpoints";
import type { EnrollmentPreviewResponse, EnrollmentResponse } from "../../lib/enrollments/types";

vi.mock("../../lib/enrollments/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/enrollments/endpoints")>();
  return { ...actual, getEligibleCandidates: vi.fn(), previewEnrollment: vi.fn(), createEnrollment: vi.fn() };
});

const paidPreview: EnrollmentPreviewResponse = {
  billing_mode: "paid",
  price_at_enrollment: "1200.00",
  billed_months: 5,
  total_amount: "6000.00",
  first_charge: { period_start: "2026-11-01", due_date: "2026-11-13", amount: "1200.00" },
};
const grantPreview: EnrollmentPreviewResponse = { billing_mode: "grant", price_at_enrollment: "1200.00", billed_months: 0, total_amount: "0.00", first_charge: null };

function renderModal(onEnrolled: (id: number) => void = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <EnrollStudentModal open courseId={42} courseTitle="Frontend" coursePrice="1200.00" onClose={vi.fn()} onEnrolled={onEnrolled} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

async function selectCandidate(): Promise<void> {
  fireEvent.click(await screen.findByRole("radio", { name: /Zara Karimova/ }));
}

describe("EnrollStudentModal grants and monthly fee", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    vi.mocked(endpoints.getEligibleCandidates).mockResolvedValue({
      items: [{ id: 201, first_name: "Zara", last_name: "Karimova", email: "zara@example.com", phone: null }],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });
    vi.mocked(endpoints.previewEnrollment).mockImplementation(async (payload) => (payload.billing_mode === "grant" ? grantPreview : paidPreview));
    vi.mocked(endpoints.createEnrollment).mockResolvedValue({ id: 9, student_id: 201, course_id: 42 } as EnrollmentResponse);
  });

  afterEach(() => cleanup());

  it("prefills the fee with the course price and previews first charge, months and total", async () => {
    renderModal();
    const feeInput = screen.getByLabelText("Monthly fee") as HTMLInputElement;
    expect(feeInput.value).toBe("1200.00");
    await selectCandidate();
    const preview = await screen.findByTestId("enroll-preview");
    expect(preview.textContent).toContain("1 200 TJS");
    expect(preview.textContent).toContain("5 billed months");
    expect(preview.textContent).toContain("6 000 TJS");
    expect(endpoints.previewEnrollment).toHaveBeenCalledWith({ student_id: 201, course_id: 42, billing_mode: "paid", price_at_enrollment: "1200.00" });
  });

  it("debounces fee edits into one preview call and submits the edited fee as a string", async () => {
    const onEnrolled = vi.fn();
    renderModal(onEnrolled);
    await selectCandidate();
    await screen.findByTestId("enroll-preview");
    vi.mocked(endpoints.previewEnrollment).mockClear();
    const feeInput = screen.getByLabelText("Monthly fee");
    fireEvent.change(feeInput, { target: { value: "9" } });
    fireEvent.change(feeInput, { target: { value: "90" } });
    fireEvent.change(feeInput, { target: { value: "900.50" } });
    await waitFor(() => expect(endpoints.previewEnrollment).toHaveBeenCalledTimes(1));
    expect(endpoints.previewEnrollment).toHaveBeenCalledWith({ student_id: 201, course_id: 42, billing_mode: "paid", price_at_enrollment: "900.50" });
    fireEvent.click(screen.getByRole("button", { name: "Enroll student" }));
    await waitFor(() => expect(onEnrolled).toHaveBeenCalledWith(201));
    expect(endpoints.createEnrollment).toHaveBeenCalledWith({ student_id: 201, course_id: 42, billing_mode: "paid", price_at_enrollment: "900.50" });
  });

  it.each(["0", "0.00", "-5", "abc", "", "12.345"])("rejects the fee %s: no preview, submit disabled", async (badFee: string) => {
    renderModal();
    await selectCandidate();
    await screen.findByTestId("enroll-preview");
    vi.mocked(endpoints.previewEnrollment).mockClear();
    fireEvent.change(screen.getByLabelText("Monthly fee"), { target: { value: badFee } });
    expect(await screen.findByText("Enter an amount greater than zero")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Enroll student" }) as HTMLButtonElement).disabled).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(endpoints.previewEnrollment).not.toHaveBeenCalled();
  });

  it("hides the fee for a grant, shows the no-charges line and submits billing_mode grant without a price", async () => {
    const onEnrolled = vi.fn();
    renderModal(onEnrolled);
    await selectCandidate();
    fireEvent.click(screen.getByRole("switch", { name: "Grant (free study)" }));
    expect(screen.queryByLabelText("Monthly fee")).toBeNull();
    expect((await screen.findByTestId("enroll-preview")).textContent).toBe("Grant: no charges will be created.");
    expect(endpoints.previewEnrollment).toHaveBeenLastCalledWith({ student_id: 201, course_id: 42, billing_mode: "grant" });
    fireEvent.click(screen.getByRole("button", { name: "Enroll student" }));
    await waitFor(() => expect(onEnrolled).toHaveBeenCalled());
    expect(endpoints.createEnrollment).toHaveBeenCalledWith({ student_id: 201, course_id: 42, billing_mode: "grant" });
  });

  it("shows a preview error with a working retry", async () => {
    vi.mocked(endpoints.previewEnrollment).mockRejectedValueOnce(new Error("boom"));
    renderModal();
    await selectCandidate();
    expect(await screen.findByText("Could not calculate charges")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("enroll-preview")).toBeTruthy();
  });
});
