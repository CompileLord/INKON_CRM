import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import type { AuditEvent } from "../../lib/audit/api";
import { AuditSentence } from "./AuditSentence";
import { useAuditEventText } from "./useAuditEventText";

function event(overrides: Partial<AuditEvent>): AuditEvent {
  return { id: 1, user_id: 1, actor_name: "Admin Adminov", action: "update", entity_type: "enrollment", entity_id: 5, entity_label: "Zara Karimova", student_id: 9, course_id: 3, course_title: "Python Advanced", amount: null, created_at: "2026-10-20T08:00:00Z", changes: [], ...overrides };
}

const withdrawal: AuditEvent = event({
  changes: [
    { id: 1, field_name: "changed_fields", old_value: null, new_value: '["status"]' },
    { id: 2, field_name: "cancelled_amount", old_value: null, new_value: "1500.00" },
    { id: 3, field_name: "months_cancelled", old_value: null, new_value: "3" },
  ],
});

function Probe({ item }: { item: AuditEvent }) {
  const text = useAuditEventText(item);
  return (
    <div>
      <p data-testid="sentence"><AuditSentence event={item} /></p>
      <p data-testid="subtitle">{text.subtitle}</p>
    </div>
  );
}

beforeEach(async () => i18n.changeLanguage("ru"));
afterEach(cleanup);

describe("audit withdrawal sentence", () => {
  it("says who withdrew whom from which course with months and amount in Russian", () => {
    render(<Probe item={withdrawal} />);
    expect(screen.getByTestId("sentence").textContent).toBe("Admin Adminov отчислил(а) студента Zara Karimova с курса Python Advanced");
    expect(screen.getByTestId("subtitle").textContent).toContain("Отменено месяцев: 3");
    expect(screen.getByTestId("subtitle").textContent).toContain("1 500");
  });

  it("is translated in English and Tajik too and never prints raw field names", async () => {
    for (const language of ["en", "tg"]) {
      await i18n.changeLanguage(language);
      const { unmount } = render(<Probe item={withdrawal} />);
      const text: string = `${screen.getByTestId("sentence").textContent}${screen.getByTestId("subtitle").textContent}`;
      expect(text).toContain("Zara Karimova");
      expect(text).not.toMatch(/cancelled_amount|months_cancelled/);
      unmount();
    }
  });

  it("omits a technical value from a generic change instead of printing it", () => {
    const technical: AuditEvent = event({
      entity_type: "course",
      entity_label: "Python Advanced",
      changes: [{ id: 1, field_name: "status", old_value: "{'x': 1}", new_value: "<CourseStatus.ARCHIVED: 'archived'>" }],
    });
    render(<Probe item={technical} />);
    expect(`${screen.getByTestId("sentence").textContent}${screen.getByTestId("subtitle").textContent}`).not.toMatch(/\{|<CourseStatus|'x'/);
  });

  it("translates plain course status and payment method values", () => {
    const course: AuditEvent = event({
      entity_type: "course",
      entity_label: "Python Advanced",
      changes: [{ id: 1, field_name: "status", old_value: "active", new_value: "archived" }],
    });
    render(<Probe item={course} />);
    const text: string = `${screen.getByTestId("sentence").textContent}${screen.getByTestId("subtitle").textContent}`;
    expect(text).not.toMatch(/archived|active/);
    expect(text).toMatch(/В архиве/);
    const payment: AuditEvent = event({
      entity_type: "payment",
      action: "create",
      entity_label: "Zara Karimova",
      amount: "100.00",
      changes: [{ id: 1, field_name: "method", old_value: null, new_value: "cash" }],
    });
    cleanup();
    render(<Probe item={payment} />);
    const paymentText: string = `${screen.getByTestId("sentence").textContent}${screen.getByTestId("subtitle").textContent}`;
    expect(paymentText).not.toMatch(/\bcash\b/);
    expect(paymentText).toContain("Наличные");
  });
});
