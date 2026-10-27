import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { QuickSettingsChanger } from "./QuickSettingsChanger";

afterEach(cleanup);

describe("QuickSettingsChanger", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru");
  });

  it("links to the full settings page and closes the drawer on click", () => {
    const onNavigate = vi.fn();
    render(<MemoryRouter><QuickSettingsChanger onNavigate={onNavigate} /></MemoryRouter>);
    const link: HTMLElement = screen.getByRole("link", { name: "Все настройки →" });
    expect(link.getAttribute("href")).toBe("/settings");
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("shows no settings link where there is no signed-in settings page", () => {
    render(<MemoryRouter><QuickSettingsChanger /></MemoryRouter>);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
