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
import i18n from "../i18n";

const mock = new MockAdapter(httpClient);
const logsUrl = /\/audit-log\/events\/\?/;
const optionsUrl = /\/audit-log\/filter-options\//;

const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

function change(field_name: string, old_value: string | null, new_value: string | null, id: number = 1): AuditChange {
  return { id, field_name, old_value, new_value };
}

function log(overrides: Partial<AuditEvent> & { id: number; field_name?: string; old_value?: string | null; new_value?: string | null }): AuditEvent {
  const { field_name = "amount", old_value = null, new_value = "150.00", ...rest } = overrides;
  return {
    user_id: 5,
    actor_name: "Aziz Karimov",
    action: "create",
    entity_type: "payment",
    entity_id: 4201,
    entity_label: "Malika Rahimova",
    student_id: 7,
    course_id: null,
    course_title: null,
    amount: null,
    created_at: minutesAgo(5),
    changes: [change(field_name, old_value, new_value, rest.id)],
    ...rest,
  };
}

const paymentCreated = log({
  id: 30, amount: "75.50", course_id: 3, course_title: "Web Design",
  changes: [change("amount", null, "75.50", 30), change("method", null, "cash", 31), change("student_id", null, "7", 32), change("course_id", null, "3", 33)],
});
const courseUpdated = log({
  id: 29, action: "update", entity_type: "course", entity_id: 9001, entity_label: "Python Advanced", student_id: null, course_id: 9,
  field_name: "price", old_value: "800.00", new_value: "850.50", created_at: minutesAgo(26 * 60),
});

function listing(items: AuditEvent[], overrides: Record<string, number> = {}) {
  return { items, total: items.length, page: 1, page_size: 20, total_pages: 1, ...overrides };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderAudit(query: string = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/audit" + query]}>
        <Audit />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const location = (): string => screen.getByTestId("location").textContent ?? "";
const logRequests = () => mock.history.get.filter((request) => logsUrl.test(request.url ?? ""));
const lastParams = (): URLSearchParams => new URLSearchParams((logRequests().at(-1)?.url ?? "").split("?")[1]);

beforeEach(async () => {
  mock.reset();
  await i18n.changeLanguage("en");
  useAuthStore.setState({ role: "superadmin" });
  mock.onGet(optionsUrl).reply(200, {
    actors: [{ id: 5, name: "Aziz Karimov" }, { id: 6, name: "Dilnoza Aliyeva" }],
    entity_types: ["course", "payment", "journal_entry"],
  });
  mock.onGet(logsUrl).reply(200, listing([paymentCreated, courseUpdated]));
});
afterEach(cleanup);

describe("Audit registry rows", () => {
  it("reads each row as a sentence with names and no database identifiers", async () => {
    renderAudit();
    const row = (await screen.findByText(/recorded 75\.50 TJS from Malika Rahimova/)).closest("button") as HTMLElement;
    expect(within(row).getByText("Aziz Karimov")).toBeTruthy();
    expect(row.textContent).toContain("Cash · Web Design");
    const registry = row.closest("main, div") as HTMLElement;
    expect(registry.textContent).not.toMatch(/#\d|user_id|journal_entry|4201|9001/);
    expect(document.querySelector("table")).toBeNull();
  });

  it("groups rows under Today and a dated heading and keeps absolute time in a title", async () => {
    renderAudit();
    await screen.findByText(/recorded 75\.50 TJS/);
    expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBe(2);
    const relative = document.querySelector("time[title]") as HTMLElement;
    expect(relative.getAttribute("title")).toMatch(/\d/);
    expect(screen.getAllByText(/5 minutes ago/).length).toBeGreaterThan(0);
  });

  it("never invents an actor when the name is unavailable", async () => {
    mock.onGet(logsUrl).reply(200, listing([log({ id: 31, user_id: null, actor_name: null })]));
    renderAudit();
    expect(await screen.findByText("Actor unavailable")).toBeTruthy();
  });

  it("keeps unknown actions and entity types readable", async () => {
    mock.onGet(logsUrl).reply(200, listing([log({ id: 32, action: "teleport", entity_type: "flux_capacitor", entity_label: null })]));
    renderAudit();
    expect(await screen.findByText(/changed flux capacitor/)).toBeTruthy();
  });
});

describe("Audit server filters", () => {
  it("sends the URL filters to the server and restores them", async () => {
    renderAudit("?page=2&actor=5&action=update&entity=course&from=2026-10-01&to=2026-10-02&q=price");
    await screen.findByText(/recorded 75\.50 TJS/);
    const params = lastParams();
    expect(params.get("page")).toBe("2");
    expect(params.get("actor_id")).toBe("5");
    expect(params.get("action")).toBe("update");
    expect(params.get("entity_type")).toBe("course");
    expect(params.get("date_from")).toBe("2026-10-01");
    expect(params.get("date_to")).toBe("2026-10-02");
    expect(params.get("search")).toBe("price");
    expect(screen.getByText("By Aziz Karimov")).toBeTruthy();
    expect(screen.getByRole("searchbox")).toHaveProperty("value", "price");
  });

  it("applies the actor through a listbox, resets to page one and removes the chip", async () => {
    renderAudit("?page=3");
    await screen.findByText(/recorded 75\.50 TJS/);
    await userEvent.click(screen.getByRole("button", { name: /^Who/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Dilnoza Aliyeva" }));
    await waitFor(() => expect(location()).toBe("/audit?actor=6"));
    await waitFor(() => expect(lastParams().get("actor_id")).toBe("6"));
    expect(lastParams().get("page")).toBe("1");
    expect(document.querySelector("select")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove filter: By Dilnoza Aliyeva" }));
    await waitFor(() => expect(location()).toBe("/audit"));
    await waitFor(() => expect(lastParams().has("actor_id")).toBe(false));
  });

  it("searches across the server instead of filtering the loaded page", async () => {
    renderAudit();
    await screen.findByText(/recorded 75\.50 TJS/);
    const before = logRequests().length;
    await userEvent.type(screen.getByRole("searchbox"), "zzz-not-on-this-page");
    await waitFor(() => expect(lastParams().get("search")).toBe("zzz-not-on-this-page"));
    expect(logRequests().length).toBeGreaterThan(before);
    expect(location()).toBe("/audit?q=zzz-not-on-this-page");
  });

  it("combines action and entity filters and clears everything", async () => {
    renderAudit("?action=delete&entity=payment");
    await screen.findByText(/recorded 75\.50 TJS/);
    expect(lastParams().get("action")).toBe("delete");
    expect(lastParams().get("entity_type")).toBe("payment");
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(location()).toBe("/audit"));
    await waitFor(() => expect(lastParams().has("action")).toBe(false));
    expect(lastParams().has("entity_type")).toBe(false);
  });

  it("ignores malformed URL filters instead of sending them", async () => {
    renderAudit("?actor=abc&action=explode&entity=Bad%20Value&ref=3&from=nope");
    await screen.findByText(/recorded 75\.50 TJS/);
    const params = lastParams();
    for (const key of ["actor_id", "action", "entity_type", "entity_id", "date_from"]) expect(params.has(key)).toBe(false);
  });
});

describe("Audit states", () => {
  it("explains an empty log, and offers Clear only when filters hide everything", async () => {
    mock.onGet(logsUrl).reply(200, listing([]));
    renderAudit();
    expect(await screen.findByText(/No changes recorded yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    cleanup();
    renderAudit("?action=void");
    expect(await screen.findByText("No changes match these filters.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Clear filters" }).length).toBeGreaterThan(0);
  });

  it("shows a loading status then a retryable error", async () => {
    mock.onGet(logsUrl).reply(500);
    renderAudit();
    expect(screen.getByText("Loading changes")).toBeTruthy();
    expect(await screen.findByText("The audit log could not be loaded.")).toBeTruthy();
    mock.onGet(logsUrl).reply(200, listing([paymentCreated]));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/recorded 75\.50 TJS/)).toBeTruthy();
  });

  it("keeps loaded rows with a notice when a refresh fails", async () => {
    renderAudit();
    await screen.findByText(/recorded 75\.50 TJS/);
    mock.onGet(logsUrl).reply(500);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Could not refresh. Showing the last loaded changes.")).toBeTruthy();
    expect(screen.getByText(/recorded 75\.50 TJS/)).toBeTruthy();
  });

  it("reports the server total and range", async () => {
    mock.onGet(logsUrl).reply(200, listing([paymentCreated, courseUpdated], { total: 45, page: 2, total_pages: 3 }));
    renderAudit("?page=2");
    expect(await screen.findByText("Changes: 45")).toBeTruthy();
    expect(screen.getByText("21–22 of 45")).toBeTruthy();
  });
});

describe("Audit events", () => {
  const voided = log({
    id: 60, action: "void", amount: "75.50", created_at: minutesAgo(3),
    changes: [change("reason_code", null, "entry_error", 60), change("void_entry_id", null, "4", 61)],
  });

  it("shows one event row for a payment instead of one row per field", async () => {
    renderAudit();
    await screen.findByText(/recorded 75\.50 TJS/);
    expect(screen.getAllByRole("button", { name: /Aziz Karimov/ })).toHaveLength(2);
    expect(screen.queryByText(/Course recorded|Student recorded|Amount: 75\.50/)).toBeNull();
    expect(screen.getByText("Cash · Web Design")).toBeTruthy();
  });

  it("summarizes a void with the amount, the student and a humanized reason", async () => {
    mock.onGet(logsUrl).reply(200, listing([voided]));
    renderAudit();
    const row = (await screen.findByText(/voided 75\.50 TJS payment from Malika Rahimova/)).closest("button") as HTMLElement;
    expect(row.textContent).toContain("Reason: Entry error");
  });

  it("keeps a single changed field readable and counts several fields honestly", async () => {
    mock.onGet(logsUrl).reply(200, listing([
      courseUpdated,
      log({ id: 70, action: "update", entity_type: "course", entity_label: "Python Advanced", changes: [change("price", "1", "2", 70), change("title", "A", "B", 71), change("status", "open", "closed", 72)] }),
    ]));
    renderAudit();
    expect(await screen.findByText(/Price: 800\.00 → 850\.50/)).toBeTruthy();
    expect(screen.getByText(/3 fields changed/)).toBeTruthy();
    expect(screen.queryByText(/Title: A/)).toBeNull();
  });

  it("lists every field before and after in the inspector", async () => {
    renderAudit();
    await userEvent.click((await screen.findByText(/recorded 75\.50 TJS/)).closest("button") as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    for (const field of ["Amount", "Method", "Student", "Course"]) expect(within(dialog).getByText(field)).toBeTruthy();
    expect(within(dialog).getAllByText("Before")).toHaveLength(4);
    expect(within(dialog).getAllByText("After")).toHaveLength(4);
  });

  it("requests events, so pagination counts events", async () => {
    mock.onGet(logsUrl).reply(200, listing([paymentCreated], { total: 41, total_pages: 3 }));
    renderAudit();
    expect(await screen.findByText("Changes: 41")).toBeTruthy();
    expect(logRequests()[0].url).toContain("/audit-log/events/");
  });
});

describe("Audit inspector", () => {
  it("shows a before/after comparison and returns focus to the row on Escape", async () => {
    renderAudit();
    const row = (await screen.findByText(/updated course/)).closest("button") as HTMLButtonElement;
    await userEvent.click(row);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Before").nextSibling?.textContent).toBe("800.00");
    expect(within(dialog).getByText("After").nextSibling?.textContent).toBe("850.50");
    expect(within(dialog).getByRole("link", { name: "Open course" }).getAttribute("href")).toBe("/courses/9");
    expect(within(dialog).queryByRole("link", { name: "Open student" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(row));
  });

  it("distinguishes no value, empty text, the literal string null, zero and false", async () => {
    const cases: [{ old_value: string | null; new_value: string | null }, string][] = [
      [{ old_value: null, new_value: "x" }, "No value"],
      [{ old_value: "", new_value: "x" }, "Empty text"],
      [{ old_value: "null", new_value: "x" }, "null"],
      [{ old_value: "0", new_value: "x" }, "0"],
      [{ old_value: "false", new_value: "x" }, "false"],
    ];
    for (const [overrides, expected] of cases) {
      mock.onGet(logsUrl).reply(200, listing([log({ id: 40, action: "update", field_name: "score", ...overrides })]));
      renderAudit();
      await userEvent.click((await screen.findByText(/updated payment/)).closest("button") as HTMLElement);
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("Before").nextSibling?.textContent).toBe(expected);
      cleanup();
    }
  });

  it("translates only known field and value combinations and keeps unknown ones raw", async () => {
    mock.onGet(logsUrl).reply(200, listing([
      log({ id: 41, field_name: "method", new_value: "transfer" }),
      log({ id: 42, field_name: "mystery_field", new_value: "transfer" }),
    ]));
    renderAudit();
    await screen.findAllByText(/created payment/);
    expect(screen.getByText(/Method: Bank transfer/)).toBeTruthy();
    expect(screen.getByText(/Mystery field: transfer/)).toBeTruthy();
  });

  it("translates serialized enum members and hides raw identifiers in summaries", async () => {
    mock.onGet(logsUrl).reply(200, listing([
      log({ id: 50, field_name: "method", new_value: "PaymentMethod.TRANSFER" }),
      log({ id: 51, field_name: "student_id", new_value: "13" }),
      log({ id: 52, action: "void", field_name: "reason_code", old_value: null, new_value: "entry_error" }),
    ]));
    renderAudit();
    await screen.findAllByText(/created payment/);
    expect(screen.getByText(/Method: Bank transfer/)).toBeTruthy();
    expect(screen.getByText(/Student recorded/)).toBeTruthy();
    expect(screen.getByText(/Reason: Entry error/)).toBeTruthy();
    expect(screen.queryByText(/entry_error/)).toBeNull();
    expect(screen.queryByText(/Student: 13/)).toBeNull();
  });

  it("keeps technical data collapsed and read-only, and narrows to one record", async () => {
    renderAudit();
    await userEvent.click((await screen.findByText(/recorded 75\.50 TJS/)).closest("button") as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect((dialog.querySelector("details") as HTMLDetailsElement).open).toBe(false);
    expect(within(dialog).getByRole("link", { name: "Open student" }).getAttribute("href")).toBe("/students/7");
    expect(within(dialog).queryByRole("button", { name: /delete|edit|rollback/i })).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Show all changes to this record" }));
    await waitFor(() => expect(location()).toBe("/audit?entity=payment&ref=4201"));
    await waitFor(() => expect(lastParams().get("entity_id")).toBe("4201"));
    expect(screen.getByText("Only this payment")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
