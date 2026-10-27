import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { Audit } from "./Audit";
import { httpClient } from "../lib/auth/httpClient";
import { useAuthStore } from "../store/authStore";
import type { AuditChange, AuditEvent } from "../lib/audit/api";
import { AuditPresentation } from "../lib/audit/auditPresentation";
import { AuditUrlState } from "../lib/audit/auditUrlState";
import i18n from "../i18n";

const mock = new MockAdapter(httpClient);
const logsUrl = /\/audit-log\/events\/\?/;
const optionsUrl = /\/audit-log\/filter-options\//;

function change(field_name: string, old_value: string | null, new_value: string | null, id: number = 1): AuditChange {
  return { id, field_name, old_value, new_value };
}

function event(id: number, overrides: Partial<AuditEvent>): AuditEvent {
  return {
    id,
    user_id: 5,
    actor_name: "Администратор Школы",
    action: "update",
    entity_type: "course",
    entity_id: id,
    entity_label: null,
    student_id: null,
    course_id: null,
    course_title: null,
    amount: null,
    created_at: new Date(Date.now() - id * 60_000).toISOString(),
    changes: [],
    ...overrides,
  };
}

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderAudit(query: string = ""): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/audit" + query]}>
        <Audit />
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function listing(items: AuditEvent[]) {
  return { items, total: items.length, page: 1, page_size: 20, total_pages: 1 };
}

const logRequests = () => mock.history.get.filter((request) => logsUrl.test(request.url ?? ""));
const lastParams = (): URLSearchParams => new URLSearchParams((logRequests().at(-1)?.url ?? "").split("?")[1]);

async function rowText(items: AuditEvent[]): Promise<string[]> {
  mock.onGet(logsUrl).reply(200, listing(items));
  renderAudit();
  await waitFor(() => expect(document.querySelectorAll("[data-audit-row]").length).toBe(items.length));
  const rows: string[] = [...document.querySelectorAll("[data-audit-row]")].map((row) => row.textContent ?? "");
  cleanup();
  return rows;
}

beforeEach(async () => {
  mock.reset();
  await i18n.changeLanguage("ru");
  useAuthStore.setState({ role: "superadmin" });
  mock.onGet(optionsUrl).reply(200, { actors: [], entity_types: [] });
  mock.onGet(logsUrl).reply(200, listing([]));
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("en");
});

describe("Audit category control", () => {
  it("sends the category parameter for each segment and nothing for Все", async () => {
    renderAudit();
    await screen.findByRole("radiogroup", { name: "Категория" });
    expect(lastParams().has("category")).toBe(false);
    const expected: [string, string][] = [["Оплаты", "payments"], ["Студенты", "students"], ["Курсы", "courses"], ["Журнал", "journal"], ["Система", "system"]];
    for (const [label, value] of expected) {
      await userEvent.click(screen.getByRole("radio", { name: label }));
      await waitFor(() => expect(lastParams().get("category")).toBe(value));
      expect(screen.getByTestId("location").textContent).toContain(`category=${value}`);
    }
    await userEvent.click(screen.getByRole("radio", { name: "Все" }));
    await waitFor(() => expect(lastParams().has("category")).toBe(false));
    expect(screen.getByTestId("location").textContent).not.toContain("category");
  }, 30000);

  it("restores the category from the URL and ignores an unknown one", async () => {
    renderAudit("?category=courses");
    await waitFor(() => expect(lastParams().get("category")).toBe("courses"));
    expect(screen.getByRole("radio", { name: "Курсы" }).getAttribute("aria-checked")).toBe("true");
    cleanup();
    expect(AuditUrlState.parse(new URLSearchParams("category=bogus")).category).toBeNull();
    expect(AuditUrlState.serialize(AuditUrlState.parse(new URLSearchParams("category=system"))).toString()).toBe("category=system");
  });

  it("explains an empty category and offers the way out", async () => {
    renderAudit("?category=journal");
    expect(await screen.findByText(/В этой категории ничего не найдено/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    await waitFor(() => expect(lastParams().has("category")).toBe(false));
  });

  it("puts the refresh button next to the filters, not in the page header", async () => {
    renderAudit();
    const refresh = await screen.findByRole("button", { name: "Обновить" });
    const header = document.querySelector("[data-page-header]") as HTMLElement;
    expect(header.contains(refresh)).toBe(false);
    await userEvent.click(refresh);
    await waitFor(() => expect(logRequests().length).toBeGreaterThan(1));
  });

  it("chooses one icon per category from the entity type and the queue fields", () => {
    expect(AuditPresentation.categoryOf("payment", [])).toBe("payments");
    expect(AuditPresentation.categoryOf("enrollment", [])).toBe("students");
    expect(AuditPresentation.categoryOf("course", [])).toBe("courses");
    expect(AuditPresentation.categoryOf("journal_entry", [])).toBe("journal");
    expect(AuditPresentation.categoryOf("settings", [])).toBe("system");
    expect(AuditPresentation.categoryOf("user", [change("credentials_queued", null, "initial:email")])).toBe("system");
  });

  it("renders a different category icon for payment, student, course, journal and system events", async () => {
    mock.onGet(logsUrl).reply(200, listing([
      event(1, { entity_type: "payment", action: "create", amount: "500.00", entity_label: "Камила Юсупова", changes: [change("amount", null, "500.00")] }),
      event(2, { entity_type: "user", action: "create", student_id: 7, entity_label: "Камила Юсупова", changes: [change("role", null, "student")] }),
      event(3, { entity_type: "course", entity_label: "English Elementary", changes: [change("price", "1", "2")] }),
      event(4, { entity_type: "journal_entry", changes: [change("score", "1", "2")] }),
      event(5, { entity_type: "settings", changes: [change("org_name", "A", "B")] }),
    ]));
    renderAudit();
    await waitFor(() => expect(document.querySelectorAll("[data-audit-row]").length).toBe(5));
    const categories: (string | null)[] = [...document.querySelectorAll("[data-audit-category]")].map((node) => node.getAttribute("data-audit-category"));
    expect(categories).toEqual(["payments", "students", "courses", "journal", "system"]);
  });
});

describe("Audit plain sentences", () => {
  it("names the actor, the action and the object in Russian for every entity type", async () => {
    const cases: [AuditEvent, RegExp][] = [
      [event(1, { entity_type: "payment", action: "create", amount: "500.00", entity_label: "Камила Юсупова", changes: [change("amount", null, "500.00")] }), /Администратор Школы принял оплату 500 TJS от Камила Юсупова/],
      [event(2, { entity_type: "payment", action: "void", amount: "500.00", entity_label: "Камила Юсупова", changes: [change("reason_code", null, "entry_error")] }), /аннулировал платёж 500 TJS от Камила Юсупова/],
      [event(3, { entity_type: "payment", action: "refund", amount: "100.00", entity_label: "Камила Юсупова", changes: [change("destination", null, "wallet")] }), /вернул 100 TJS студенту Камила Юсупова/],
      [event(4, { entity_type: "discount", action: "create", amount: "50.00", entity_label: "Камила Юсупова", changes: [change("amount", null, "50.00")] }), /предоставил скидку 50 TJS студенту Камила Юсупова/],
      [event(5, { entity_type: "adjustment", action: "create", amount: "20.00", changes: [change("reason_code", null, "fix")] }), /провёл корректировку на 20 TJS/],
      [event(6, { entity_type: "allocation", action: "update", entity_label: "Камила Юсупова", changes: [change("allocated", null, "30.00")] }), /зачёл 30 TJS из кредита студента Камила Юсупова/],
      [event(7, { entity_type: "accounting_period", action: "close_period", changes: [change("year", null, "2026"), change("month", null, "10"), change("status", "open", "closed")] }), /закрыл учётный период 10\.2026/],
      [event(8, { entity_type: "user", action: "create", student_id: 7, entity_label: "Камила Юсупова", changes: [change("changed_fields", null, '["first_name","role"]')] }), /создал студента Камила Юсупова/],
      [event(9, { entity_type: "user", action: "create", entity_label: "Рустам Назаров", changes: [change("role", null, "mentor")] }), /добавил ментора Рустам Назаров/],
      [event(19, { entity_type: "user", action: "update", student_id: 7, entity_label: "Камила Юсупова", changes: [change("phone", "+992900000001", "+992900000002")] }), /изменил данные студента Камила Юсупова: Телефон: \+992900000001 → \+992900000002/],
      [event(10, { entity_type: "user", action: "delete", entity_label: "Рустам Назаров", changes: [change("changed_fields", null, '["is_deleted"]')] }), /удалил пользователя Рустам Назаров/],
      [event(11, { entity_type: "enrollment", action: "create", entity_label: "Камила Юсупова", course_title: "English Elementary", changes: [change("changed_fields", null, '["student_id","course_id"]')] }), /записал студента Камила Юсупова на курс English Elementary/],
      [event(12, { entity_type: "course", action: "create", entity_label: "English Elementary", changes: [change("changed_fields", null, '["title","price"]')] }), /создал курс English Elementary/],
      [event(13, { entity_type: "journal", entity_label: "English Elementary", changes: [change("exam_max_score", "10", "20")] }), /изменил максимальные баллы журнала English Elementary: Максимальный балл экзамена: 10 → 20/],
      [event(14, { entity_type: "journal_entry", changes: [change("score", "4", "5")] }), /изменил запись в журнале: Балл: 4 → 5/],
      [event(15, { entity_type: "settings", changes: [change("notify_debts", "True", "False")] }), /изменил настройки школы: Уведомления о долгах: Да → Нет/],
      [event(16, { entity_type: "student_telegram_link", entity_label: "Камила Юсупова", changes: [change("link_code_expires_at", null, "2026-10-22T16:38:09+00:00")] }), /создал код привязки Telegram|обновил код привязки Telegram родителя студента Камила Юсупова/],
      [event(17, { entity_type: "debt_reminder", action: "create", changes: [change("amount", null, "300.00")] }), /отправил напоминание о долге на 300 TJS/],
      [event(18, { entity_type: "journal_student_summary", changes: [change("exam_score", "1", "2")] }), /обновил итоги студента за период/],
    ];
    const rows: string[] = await rowText(cases.map(([item]) => item));
    cases.forEach(([, pattern], index) => expect(rows[index], `case ${index + 1}`).toMatch(pattern));
    rows.forEach((row) => expect(row).not.toMatch(/changed_fields|[a-z]+_[a-z_]+|изменение —|Автор недоступен/));
  });

  it("writes the course schedule change as one sentence with the weekday and both times", async () => {
    const rows: string[] = await rowText([
      event(1, {
        entity_label: "English Elementary",
        changes: [
          change("schedules.0.time_start", "09:00:00", "10:00:00", 1),
          change("schedules.0.time_end", "11:00:00", "12:00:00", 2),
        ],
      }),
    ]);
    expect(rows[0]).toContain("Администратор Школы изменил курс English Elementary: время занятий Пн 09:00–11:00 → 10:00–12:00");
  });

  it("reads in English with the same structure", async () => {
    await i18n.changeLanguage("en");
    const rows: string[] = await rowText([
      event(1, { entity_type: "user", action: "create", student_id: 7, entity_label: "Kamila Yusupova", changes: [change("role", null, "student")] }),
      event(2, { entity_label: "English Elementary", changes: [change("schedules.2.time_start", "09:00:00", "10:00:00")] }),
    ]);
    expect(rows[0]).toContain("Администратор Школы created the student Kamila Yusupova");
    expect(rows[1]).toContain("changed the course English Elementary: lesson start Wed: 09:00 → 10:00");
  });

  it("turns queue events into translated sentences with the reason and channel", async () => {
    const queue = (id: number, field: string, value: string): AuditEvent =>
      event(id, { entity_type: "user", user_id: null, actor_name: null, entity_label: "Камила Юсупова", changes: [change(field, null, value)] });
    const rows: string[] = await rowText([
      queue(1, "credentials_queued", "initial:student_phone"),
      queue(2, "password_sms_queued", "reset:parent_phone"),
      queue(3, "credentials_queued", "initial:email"),
    ]);
    expect(rows[0]).toContain("Система: отправлены данные для входа по SMS студенту");
    expect(rows[0]).toContain("Камила Юсупова");
    expect(rows[1]).toContain("Система: отправлен новый пароль по SMS родителю");
    expect(rows[2]).toContain("Система: отправлены данные для входа на email");
    rows.forEach((row) => expect(row).not.toMatch(/queued|initial:|reset:|_phone/));
    await i18n.changeLanguage("en");
    const english: string[] = await rowText([queue(4, "credentials_queued", "initial:parent_phone")]);
    expect(english[0]).toContain("System: login details sent by SMS to the parent");
  });

  it("words a system Telegram link event without a masculine verb after Система", async () => {
    const rows: string[] = await rowText([event(1, { user_id: null, actor_name: null, entity_type: "student_telegram_link", changes: [change("link_code_expires_at", null, "2026-10-22T16:38:09+00:00")] })]);
    expect(rows[0]).toContain("Система: обновлён код привязки Telegram родителя");
  });

  it("renders a missing actor as Система in the three languages", async () => {
    for (const [language, expected] of [["ru", "Система"], ["tg", "Система"], ["en", "System"]] as const) {
      await i18n.changeLanguage(language);
      const rows: string[] = await rowText([event(1, { user_id: null, actor_name: null, entity_type: "student_telegram_link", entity_label: "Камила Юсупова", changes: [change("parent_telegram_chat_id", null, "123")] })]);
      expect(rows[0].startsWith(expected)).toBe(true);
    }
  });
});

describe("Audit inspector labels", () => {
  it("shows translated field and value labels and no raw keys", { timeout: 30000 }, async () => {
    mock.onGet(logsUrl).reply(200, listing([
      event(1, {
        entity_label: "English Elementary",
        course_id: 4,
        changes: [
          change("status", "active", "archived", 1),
          change("start_date", "2026-09-01", "2026-10-01", 2),
          change("schedules.0.time_start", "09:00:00", "10:00:00", 3),
        ],
      }),
      event(2, { entity_type: "user", entity_label: "Камила Юсупова", changes: [change("role", "student", "mentor", 4), change("payment_day_of_month", "5", "10", 5)] }),
      event(3, { entity_type: "user", user_id: null, actor_name: null, entity_label: "Камила Юсупова", changes: [change("credentials_queued", null, "initial:parent_phone", 6)] }),
    ]));
    renderAudit();
    await waitFor(() => expect(document.querySelectorAll("[data-audit-row]").length).toBe(3));
    const rows: HTMLElement[] = [...document.querySelectorAll<HTMLElement>("[data-audit-row]")];

    await userEvent.click(rows[0]);
    let dialog = await screen.findByRole("dialog");
    for (const label of ["Статус", "Дата начала", "Начало занятий, Пн"]) expect(within(dialog).getByText(label)).toBeTruthy();
    expect(within(dialog).getByText("Активен")).toBeTruthy();
    expect(within(dialog).getByText("В архиве")).toBeTruthy();
    expect(within(dialog).getByText("01.09.2026")).toBeTruthy();
    expect(within(dialog).getByText("10:00")).toBeTruthy();
    expect(dialog.querySelector("ul")?.textContent).not.toMatch(/start_date|time_start|archived|active/);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.click(rows[1]);
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Роль")).toBeTruthy();
    expect(within(dialog).getByText("Студент")).toBeTruthy();
    expect(within(dialog).getByText("Ментор")).toBeTruthy();
    expect(within(dialog).getByText("День оплаты в месяце")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.click(rows[2]);
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Данные для входа")).toBeTruthy();
    expect(within(dialog).getByText("Первые данные для входа по SMS родителю")).toBeTruthy();
    expect(within(dialog).getAllByText("Система").length).toBeGreaterThan(0);
  });
});
