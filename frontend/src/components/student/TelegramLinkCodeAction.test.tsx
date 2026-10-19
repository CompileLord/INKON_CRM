import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { TelegramLinkCodeAction } from "./TelegramLinkCodeAction";
import { ParentLinkBadge } from "../students/ParentLinkBadge";

const generateTelegramLinkCode = vi.fn();

vi.mock("../../lib/users/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/users/endpoints")>();
  return { ...actual, generateTelegramLinkCode: (studentId: number) => generateTelegramLinkCode(studentId) };
});

function renderAction(activeCodeExpiresAt: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <TelegramLinkCodeAction studentId={7} activeCodeExpiresAt={activeCodeExpiresAt} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  generateTelegramLinkCode.mockReset();
});
afterEach(cleanup);

describe("TelegramLinkCodeAction", () => {
  it("generates a code for the student, shows it once and copies it", async () => {
    generateTelegramLinkCode.mockResolvedValue({ code: "12A345", expires_at: "2026-10-26T12:00:00Z" });
    const user = userEvent.setup();
    renderAction();

    await user.click(screen.getByRole("button", { name: "Generate code" }));

    expect((await screen.findByLabelText("Parent link code")).textContent).toBe("12A345");
    expect(generateTelegramLinkCode).toHaveBeenCalledWith(7);
    await user.click(screen.getByRole("button", { name: "Copy code" }));
    expect(await navigator.clipboard.readText()).toBe("12A345");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("shows a code handed over from student creation immediately", () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>
          <TelegramLinkCodeAction studentId={7} activeCodeExpiresAt={null} initialCode="99Z999" />
        </I18nextProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText("Parent link code").textContent).toBe("99Z999");
    expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy();
  });

  it("offers a new code when one is already active and never shows a code on load", () => {
    renderAction("2026-10-26T12:00:00Z");
    expect(screen.getByRole("button", { name: "New code" })).toBeTruthy();
    expect(screen.queryByLabelText("Parent link code")).toBeNull();
  });

  it("shows a retryable error when generation fails", async () => {
    generateTelegramLinkCode.mockRejectedValue(new Error("boom"));
    renderAction();
    await userEvent.setup().click(screen.getByRole("button", { name: "Generate code" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not generate the code"));
    expect((screen.getByRole("button", { name: "Generate code" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("ParentLinkBadge", () => {
  it("distinguishes linked from not linked parents", () => {
    const { rerender } = render(<I18nextProvider i18n={i18n}><ParentLinkBadge linked /></I18nextProvider>);
    expect(screen.getByText("Parent linked")).toBeTruthy();
    rerender(<I18nextProvider i18n={i18n}><ParentLinkBadge linked={false} /></I18nextProvider>);
    expect(screen.getByText("Parent not linked")).toBeTruthy();
  });
});
