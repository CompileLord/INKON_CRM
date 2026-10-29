import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import type { AuditEvent } from "../../lib/audit/api";
import { AuditInspector } from "./AuditInspector";

function event(overrides: Partial<AuditEvent>): AuditEvent {
  return { id: 1, user_id: 1, actor_name: "Admin Adminov", action: "create", entity_type: "payment", entity_id: 5, entity_label: "Mehrangiz Hamidova", student_id: 36, course_id: 4, course_title: "Web Frontend Development", amount: "375.00", created_at: "2026-10-20T08:00:00Z", changes: [], ...overrides };
}

const payment: AuditEvent = event({
  changes: [
    { id: 1, field_name: "amount", old_value: null, new_value: "375.00" },
    { id: 2, field_name: "student_id", old_value: null, new_value: "36" },
    { id: 3, field_name: "course_id", old_value: null, new_value: "4" },
    { id: 4, field_name: "targets", old_value: null, new_value: "[{'enrollment_id': 31, 'amount': '375.00'}]" },
    { id: 5, field_name: "method", old_value: null, new_value: "PaymentMethod.CASH" },
  ],
});

function show(item: AuditEvent): string {
  render(
    <MemoryRouter>
      <AuditInspector event={item} onClose={() => undefined} onShowRecord={() => undefined} returnFocusTo={() => null} />
    </MemoryRouter>,
  );
  return screen.getByRole("dialog").textContent ?? "";
}

beforeEach(async () => i18n.changeLanguage("ru"));
afterEach(cleanup);

describe("audit inspector fields", () => {
  it("renders a creation without before boxes", () => {
    const text: string = show(payment);
    expect(text).not.toContain("Было");
    expect(text).not.toContain("Нет значения");
    expect(text).not.toContain("Недоступно");
  });

  it("shows student and course names instead of ids", () => {
    show(payment);
    const fields: HTMLElement = screen.getByRole("region", { name: "Изменённые поля" });
    expect(fields.textContent).toContain("Mehrangiz Hamidova");
    expect(fields.textContent).not.toMatch(/Студент36|Курс4/);
  });

  it("formats money as TJS", () => {
    show(payment);
    const fields: HTMLElement = screen.getByRole("region", { name: "Изменённые поля" });
    expect(fields.textContent).toContain("375 TJS");
    expect(fields.textContent).not.toContain("375.00");
  });

  it("labels the allocation and renders readable lines", () => {
    show(payment);
    const fields: HTMLElement = screen.getByRole("region", { name: "Изменённые поля" });
    expect(fields.textContent).toContain("РаспределениеWeb Frontend Development — 375 TJS");
  });

  it("does not attach the event's single course to every line of a multi-course allocation", () => {
    show(event({ changes: [
      { id: 1, field_name: "targets", old_value: null, new_value: "[{'enrollment_id': 31, 'amount': '375.00'}, {'enrollment_id': 32, 'amount': '200.00'}]" },
    ] }));
    const fields: HTMLElement = screen.getByRole("region", { name: "Изменённые поля" });
    expect(fields.textContent).toContain("375 TJS");
    expect(fields.textContent).toContain("200 TJS");
    expect(fields.textContent).not.toContain("Web Frontend Development —");
  });

  it("omits references whose names are unknown and an unreadable allocation", () => {
    show(event({ student_id: null, course_id: null, course_title: null, changes: [
      { id: 1, field_name: "student_id", old_value: null, new_value: "36" },
      { id: 2, field_name: "targets", old_value: null, new_value: "garbage" },
      { id: 3, field_name: "method", old_value: null, new_value: "PaymentMethod.CASH" },
    ] }));
    const fields: HTMLElement = screen.getByRole("region", { name: "Изменённые поля" });
    expect(fields.textContent).not.toContain("36");
    expect(fields.textContent).not.toContain("Распределение");
    expect(fields.textContent).toContain("Наличные");
  });

  it("keeps before and after for real changes", () => {
    show(event({ action: "update", entity_type: "course", entity_label: "Web", changes: [{ id: 1, field_name: "price", old_value: "400.00", new_value: "450.00" }] }));
    const fields: HTMLElement = screen.getByRole("region", { name: "Изменённые поля" });
    expect(fields.textContent).toContain("Было400 TJS");
    expect(fields.textContent).toContain("Стало450 TJS");
  });

  it("hides the section when a creation only lists changed field names", () => {
    show(event({ entity_type: "enrollment", changes: [{ id: 1, field_name: "changed_fields", old_value: null, new_value: '["course_id", "student_id"]' }] }));
    expect(screen.queryByRole("region", { name: "Изменённые поля" })).toBeNull();
  });

  it("has an allocation label in every language", async () => {
    for (const language of ["en", "ru", "tg"]) {
      await i18n.changeLanguage(language);
      expect(i18n.exists("audit:fields.targets")).toBe(true);
      expect(i18n.t("audit:fields.targets")).not.toBe("Targets");
    }
  });
});
