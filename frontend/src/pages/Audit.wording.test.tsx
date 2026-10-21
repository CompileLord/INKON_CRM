import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { Audit } from "./Audit";
import { httpClient } from "../lib/auth/httpClient";
import { useAuthStore } from "../store/authStore";
import type { AuditEvent } from "../lib/audit/api";
import { AuditEventClusters } from "../components/audit/AuditEventClusters";
import i18n from "../i18n";

const mock = new MockAdapter(httpClient);
const logsUrl = /\/audit-log\/events\/\?/;
const optionsUrl = /\/audit-log\/filter-options\//;

function event(id: number, overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id,
    user_id: 5,
    actor_name: "Aziz Karimov",
    action: "update",
    entity_type: "journal_entry",
    entity_id: id,
    entity_label: "Month 1",
    student_id: 7,
    course_id: 3,
    course_title: "Algebra 8A",
    amount: null,
    created_at: new Date(Date.now() - id * 60_000).toISOString(),
    changes: [{ id, field_name: "score", old_value: "5", new_value: "0" }],
    ...overrides,
  };
}

function renderAudit(): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/audit"]}>
        <Audit />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function listing(items: AuditEvent[]) {
  return { items, total: items.length, page: 1, page_size: 20, total_pages: 1 };
}

beforeEach(async () => {
  mock.reset();
  await i18n.changeLanguage("en");
  useAuthStore.setState({ role: "superadmin" });
  mock.onGet(optionsUrl).reply(200, { actors: [], entity_types: [] });
});
afterEach(cleanup);

describe("Audit human wording", () => {
  it("names the changed object in plain words with course context instead of the entity key", async () => {
    mock.onGet(logsUrl).reply(200, listing([event(1)]));
    renderAudit();
    const row = (await screen.findByText(/grade changed/)).closest("button") as HTMLElement;
    expect(row.textContent).toContain("Aziz Karimov");
    expect(row.textContent).toContain("Algebra 8A");
    expect(row.textContent).toContain("Month 1");
    expect(row.textContent).toContain("Score: 5 → 0");
    expect(row.textContent).not.toMatch(/journal_entry|journal entry/i);
  });

  it("formats serialized timestamps in values as dd.MM.yyyy HH:mm", async () => {
    mock.onGet(logsUrl).reply(200, listing([
      event(2, {
        entity_type: "student_telegram_link", entity_label: "Dilnoza Karimova", course_title: null,
        changes: [{ id: 2, field_name: "link_code_expires_at", old_value: "2026-10-22T16:38:09.028352+00:00", new_value: "2026-10-22T16:38:15.415606+00:00" }],
      }),
    ]));
    renderAudit();
    const row = (await screen.findByText(/parent Telegram link code renewed/)).closest("button") as HTMLElement;
    expect(row.textContent).toMatch(/22\.10\.2026 \d{2}:\d{2} → 22\.10\.2026 \d{2}:\d{2}/);
    expect(row.textContent).not.toMatch(/T\d{2}:\d{2}|\+00:00|student_telegram_link/);
  });
});

describe("Audit duplicate grouping", () => {
  const twins: AuditEvent[] = [
    event(3, { changes: [{ id: 3, field_name: "score", old_value: "1", new_value: "2" }, { id: 4, field_name: "comment", old_value: null, new_value: "ok" }] }),
    event(4, { changes: [{ id: 5, field_name: "score", old_value: "3", new_value: "4" }, { id: 6, field_name: "comment", old_value: null, new_value: "ok" }] }),
    event(5, { changes: [{ id: 7, field_name: "score", old_value: "4", new_value: "5" }, { id: 8, field_name: "comment", old_value: null, new_value: "ok" }] }),
  ];

  it("clusters only consecutive events with the same actor, action, record and fields", () => {
    const other: AuditEvent = event(9, { actor_name: "Dilnoza Aliyeva" });
    const clusters = AuditEventClusters.cluster([twins[0], twins[1], other, twins[2]]);
    expect(clusters.map((cluster) => cluster.events.length)).toEqual([2, 1, 1]);
  });

  it("shows one row with a similar-changes count and expands to every event", async () => {
    mock.onGet(logsUrl).reply(200, listing(twins));
    renderAudit();
    await screen.findByText(/3 similar changes/);
    expect(screen.getAllByRole("button", { name: /Aziz Karimov/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /3 similar changes/ }));
    expect(screen.getAllByRole("button", { name: /Aziz Karimov/ })).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.getAllByRole("button", { name: /Aziz Karimov/ })).toHaveLength(1);
  });

  it("keeps the page free of a title icon, info tooltip and page-level max width", async () => {
    mock.onGet(logsUrl).reply(200, listing(twins));
    renderAudit();
    await screen.findByText(/3 similar changes/);
    const header = document.querySelector("[data-page-header]") as HTMLElement;
    expect(within(header).queryByRole("button", { name: /Audit log/ })).toBeNull();
    expect(header.querySelectorAll("h1 svg")).toHaveLength(0);
    expect(document.querySelector("[data-page-container]")).not.toBeNull();
  });
});
