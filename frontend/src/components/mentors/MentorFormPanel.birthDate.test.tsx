import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { MentorFormPanel } from "./MentorFormPanel";
import type { User } from "../../lib/users/types";

afterEach(cleanup);

const mentor: User = {
  id: 55,
  email: "existing.mentor@example.com",
  first_name: "Farrukh",
  last_name: "Yusupov",
  role: "mentor",
  phone: "+992901234567",
  parent_phone: null,
  date_of_birth: "1985-08-20",
  payment_day_of_month: null,
  is_deleted: false,
  must_set_password: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  photo_path: null,
  thumbnail_path: null,
};

describe("MentorFormPanel birth date", () => {
  it("shows the birth date through the shared date picker as dd.MM.yyyy without a native date input", async () => {
    await i18n.changeLanguage("en");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <MentorFormPanel open mentor={mentor} onClose={vi.fn()} onSaved={vi.fn()} />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    );
    expect(document.querySelector('input[type="date"]')).toBeNull();
    const birthDate = screen.getByLabelText(/Date of birth/i) as HTMLInputElement;
    expect(birthDate.value).toBe("20.08.1985");
    expect(birthDate.placeholder).toBe("dd.mm.yyyy");
  });
});
