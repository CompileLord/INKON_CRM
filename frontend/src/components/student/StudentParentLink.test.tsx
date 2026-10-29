import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { StudentParentLink } from "./StudentParentLink";
import type { User } from "../../lib/users/types";

const student = { id: 7, first_name: "Anoshirvon", last_name: "Rustamov", parent_linked: false, parent_link_code_expires_at: null } as unknown as User;

function renderLink(inline: boolean) {
  const client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <form data-testid="student-form">
          <StudentParentLink user={student} canManage inline={inline} />
        </form>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(cleanup);

describe("StudentParentLink inline", () => {
  it("expands inside the form instead of floating over the fields", () => {
    renderLink(true);
    const trigger: HTMLElement = document.querySelector("[data-parent-link]") as HTMLElement;

    expect(trigger.getAttribute("type")).toBe("button");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(i18n.t("studentProfile:parentLink.notLinkedHelp"))).toBeNull();

    fireEvent.click(trigger);

    const help: HTMLElement = screen.getByText(i18n.t("studentProfile:parentLink.notLinkedHelp"));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(help.closest("[data-testid='student-form']")).not.toBeNull();

    fireEvent.click(trigger);

    expect(screen.queryByText(i18n.t("studentProfile:parentLink.notLinkedHelp"))).toBeNull();
  });

  it("does not repeat the instruction in the code hint", () => {
    expect(i18n.t("students:parentLink.codeHint")).toBe("Shown once.");
  });
});
