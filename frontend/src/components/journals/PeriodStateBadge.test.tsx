import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { PeriodStateBadge } from "./PeriodStateBadge";

describe("PeriodStateBadge", () => {
  it("renders known states with correct translations", async () => {
    await i18n.changeLanguage("en");

    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <PeriodStateBadge state="empty" />
      </I18nextProvider>
    );
    expect(screen.getByText("Not started")).toBeDefined();

    rerender(
      <I18nextProvider i18n={i18n}>
        <PeriodStateBadge state="upcoming" />
      </I18nextProvider>
    );
    expect(screen.getByText("Upcoming")).toBeDefined();

    rerender(
      <I18nextProvider i18n={i18n}>
        <PeriodStateBadge state="partial" />
      </I18nextProvider>
    );
    expect(screen.getByText("In progress")).toBeDefined();

    rerender(
      <I18nextProvider i18n={i18n}>
        <PeriodStateBadge state="complete" />
      </I18nextProvider>
    );
    expect(screen.getByText("Complete")).toBeDefined();
  });

  it("renders unavailable fallback for unknown runtime states across locales", async () => {
    await i18n.changeLanguage("en");
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <PeriodStateBadge state="unexpected_status_xyz" />
      </I18nextProvider>
    );
    expect(screen.getByText("Unavailable")).toBeDefined();

    await i18n.changeLanguage("ru");
    rerender(
      <I18nextProvider i18n={i18n}>
        <PeriodStateBadge state="unexpected_status_xyz" />
      </I18nextProvider>
    );
    expect(screen.getByText("Недоступно")).toBeDefined();

    await i18n.changeLanguage("tg");
    rerender(
      <I18nextProvider i18n={i18n}>
        <PeriodStateBadge state="unexpected_status_xyz" />
      </I18nextProvider>
    );
    expect(screen.getByText("Дастнорас")).toBeDefined();
  });
});

describe("independent unknown-state ownership audit", () => {
  it.each(["__proto__", "constructor", "toString"])("treats inherited identifier %s as unavailable", async (state) => {
    await i18n.changeLanguage("en");
    const view = render(<I18nextProvider i18n={i18n}><PeriodStateBadge state={state} /></I18nextProvider>);
    try {
      expect(view.container.textContent).toBe("Unavailable");
    } finally {
      view.unmount();
    }
  });
});
