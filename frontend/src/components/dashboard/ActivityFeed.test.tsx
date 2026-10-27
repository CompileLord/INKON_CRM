import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { UseQueryResult } from "@tanstack/react-query";
import i18n from "../../i18n";
import { ActivityFeed } from "./ActivityFeed";
import * as auditHooks from "../../lib/audit/hooks";
import type { AuditEvent } from "../../lib/audit/api";
import type { Paginated } from "../../lib/pagination";

vi.mock("../../lib/audit/hooks");

function queueEvent(): AuditEvent {
  return {
    id: 1,
    user_id: null,
    actor_name: null,
    action: "create",
    entity_type: "user",
    entity_id: 9,
    entity_label: "Aziz Rahimov",
    student_id: 9,
    course_id: null,
    course_title: null,
    amount: null,
    created_at: "2026-10-27T08:00:00Z",
    changes: [{ id: 1, field_name: "password_sms_queued", old_value: null, new_value: "initial:student_phone" }],
  };
}

describe("ActivityFeed", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru");
    vi.mocked(auditHooks.useAuditEvents).mockReturnValue({
      data: { items: [queueEvent()], total: 1, page: 1, page_size: 5 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as UseQueryResult<Paginated<AuditEvent>>);
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("reads queue events as translated sentences with the system as the actor", () => {
    render(
      <MemoryRouter>
        <ActivityFeed />
      </MemoryRouter>,
    );
    const feedText: string = document.body.textContent ?? "";
    expect(feedText).toContain("Система");
    expect(feedText).toContain("по SMS студенту");
    expect(feedText).not.toContain("initial:student_phone");
    expect(feedText).not.toContain("queued");
    expect(feedText).not.toContain("Автор недоступен");
  });
});
