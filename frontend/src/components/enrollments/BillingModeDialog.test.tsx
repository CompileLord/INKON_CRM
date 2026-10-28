import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import { AuthApiError } from "../../lib/auth/errors";
import { BillingModeDialog, type BillingModeTarget } from "./BillingModeDialog";
import * as endpoints from "../../lib/enrollments/endpoints";
import type { BillingModeChangeResponse, EnrollmentResponse } from "../../lib/enrollments/types";

vi.mock("../../lib/enrollments/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/enrollments/endpoints")>();
  return { ...actual, changeBillingMode: vi.fn() };
});

const paidTarget: BillingModeTarget = { enrollmentId: 7, studentId: 3, courseId: 5, studentName: "Zara Karimova", courseTitle: "Frontend", currentMode: "paid" };

function renderDialog(target: BillingModeTarget, onClose = vi.fn(), onToast = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <BillingModeDialog target={target} onClose={onClose} onToast={onToast} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onClose, onToast };
}

describe("BillingModeDialog", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });
  afterEach(() => cleanup());

  it("requires a reason before calling the API", async () => {
    renderDialog(paidTarget);
    fireEvent.click(screen.getByRole("button", { name: "Switch to grant" }));
    expect(await screen.findByText("Enter a reason (up to 500 characters)")).toBeTruthy();
    expect(endpoints.changeBillingMode).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Switch to grant" }));
    expect(endpoints.changeBillingMode).not.toHaveBeenCalled();
  });

  it("explains each direction and sends the target mode with the trimmed reason, then toasts the summary", async () => {
    const result: BillingModeChangeResponse = {
      enrollment: { id: 7, billing_mode: "grant" } as EnrollmentResponse,
      cancelled_months: 4,
      cancelled_amount: "3200.00",
      written_off_amount: "0.00",
      generated_months: 0,
    };
    vi.mocked(endpoints.changeBillingMode).mockResolvedValue(result);
    const { onClose, onToast } = renderDialog(paidTarget);
    expect(screen.getByText(/Future unpaid months are cancelled/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "  Scholarship  " } });
    fireEvent.click(screen.getByRole("button", { name: "Switch to grant" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(endpoints.changeBillingMode).toHaveBeenCalledWith(7, { billing_mode: "grant", reason: "Scholarship" });
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining("Cancelled months: 4 (3 200 TJS)"), "success");
  });

  it("offers grant to paid with its own effect line", async () => {
    vi.mocked(endpoints.changeBillingMode).mockResolvedValue({ enrollment: { id: 7 } as EnrollmentResponse, cancelled_months: 0, cancelled_amount: "0", written_off_amount: "0", generated_months: 3 });
    renderDialog({ ...paidTarget, currentMode: "grant" });
    expect(screen.getByText("Billing starts from the next course month.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Grant ended" } });
    fireEvent.click(screen.getByRole("button", { name: "Switch to paid" }));
    await waitFor(() => expect(endpoints.changeBillingMode).toHaveBeenCalledWith(7, { billing_mode: "paid", reason: "Grant ended" }));
  });

  it.each([
    [409, "billing_mode_unchanged", "The enrollment already has this mode."],
    [409, "enrollment_not_active", "Only an active enrollment can change its mode."],
    [422, [{ type: "string_too_short", loc: ["body", "reason"], msg: "too short" }], "Check the reason and try again."],
    [500, "boom", "Could not change the mode. Please try again."],
  ])("maps %s %j to a translated message and stays open", async (status, detail, message) => {
    vi.mocked(endpoints.changeBillingMode).mockRejectedValue(new AuthApiError(status as number, detail as never));
    const { onClose, onToast } = renderDialog(paidTarget);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "why" } });
    fireEvent.click(screen.getByRole("button", { name: "Switch to grant" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onToast).not.toHaveBeenCalled();
  });
});
