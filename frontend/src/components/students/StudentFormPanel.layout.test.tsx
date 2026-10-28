import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { StudentFormPanel } from "./StudentFormPanel";

beforeEach(() => {
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = () => "blob:mock-url";
  } else {
    vi.spyOn(globalThis.URL, "createObjectURL").mockReturnValue("blob:mock-url");
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = () => {};
  } else {
    vi.spyOn(globalThis.URL, "revokeObjectURL").mockReturnValue(undefined);
  }
});

afterEach(cleanup);


function renderPanel(props: Partial<Parameters<typeof StudentFormPanel>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const defaultProps = {
    open: true,
    student: undefined,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    onAvatarSaved: vi.fn(),
    ...props,
  };

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <StudentFormPanel {...defaultProps} />
        </I18nextProvider>
      </QueryClientProvider>,
    ),
    props: defaultProps,
  };
}

describe("StudentFormPanel layout", () => {
  it("lays out names, phones and birth date in two columns with a full-width email and payment above the fold", () => {
    renderPanel();
    const form = document.getElementById("student-form") as HTMLFormElement;
    const grid = form.querySelector(".grid.sm\\:grid-cols-2") as HTMLElement;
    const cellIds = Array.from(grid.children).map((cell) => (cell.querySelector("input") as HTMLInputElement).id);
    expect(cellIds).toEqual(["student-firstName", "student-lastName", "student-phone", "student-birthDate", "student-parentPhone", "student-email"]);
    expect(screen.getByLabelText(/^Email/i).closest("div")?.className).toContain("sm:col-span-2");
    expect(grid.contains(document.getElementById("student-paymentDay"))).toBe(false);
    const paymentDay = document.getElementById("student-paymentDay") as HTMLElement;
    expect(grid.compareDocumentPosition(paymentDay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Payment details" })).toBeDefined();
    expect(form.querySelector("[name='isGrant'], [role='switch']")).toBeNull();
  });

  it("shows the phone format hint once and the password-delivery line once", () => {
    const { container } = renderPanel();
    const formatHint = "+992901234567";
    const placeholders = Array.from(container.ownerDocument.querySelectorAll("input")).filter((input) => input.placeholder === formatHint);
    expect(placeholders).toHaveLength(2);
    expect(container.ownerDocument.body.textContent).not.toContain("Format:");
    expect(screen.getAllByText(/the password is sent by email/i)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /About password delivery|About contacts/i })).toBeNull();
  });
});
