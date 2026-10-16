import { describe, expect, it } from "vitest";
import { formatRecentRelativeTime, getSchoolCalendarDate } from "../../i18n/formatters";
import type { AuditEvent } from "./api";
import { AuditPresentation } from "./auditPresentation";
import { AuditUrlState } from "./auditUrlState";

const parse = (query: string) => AuditUrlState.parse(new URLSearchParams(query));

function item(id: number, createdAt: string): AuditEvent {
  return {
    id, user_id: 1, actor_name: "A B", action: "update", entity_type: "course", entity_id: 1, entity_label: null, student_id: null, course_id: null,
    course_title: null, amount: null, created_at: createdAt, changes: [{ id, field_name: "price", old_value: null, new_value: "1" }],
  };
}

describe("audit URL state", () => {
  it("round-trips every supported filter in a stable order", () => {
    const state = parse("page=2&actor=5&action=refund&entity=payment&ref=9&from=2026-10-01&to=2026-10-31&q=%20amount%20");
    expect(state).toMatchObject({ page: 2, actorId: 5, action: "refund", entityType: "payment", entityId: 9, dateFrom: "2026-10-01", dateTo: "2026-10-31", search: "amount" });
    expect(AuditUrlState.serialize(state).toString()).toBe("page=2&actor=5&action=refund&entity=payment&ref=9&from=2026-10-01&to=2026-10-31&q=amount");
    expect(AuditUrlState.toFilters(state)).toEqual({ actorId: 5, action: "refund", entityType: "payment", entityId: 9, dateFrom: "2026-10-01", dateTo: "2026-10-31", search: "amount" });
  });

  it("drops unsupported or contradictory state", () => {
    const state = parse("page=0&actor=-1&action=teleport&entity=Not%20Valid&ref=4&from=2026-10-31&to=2026-10-01");
    expect(state).toMatchObject({ page: 1, actorId: null, action: null, entityType: null, entityId: null, dateFrom: null, dateTo: null });
    expect(AuditUrlState.hasFilters(state)).toBe(false);
  });

  it("requires an entity type before a reference is accepted and caps the search", () => {
    expect(parse("ref=4").entityId).toBeNull();
    expect(parse(`q=${"a".repeat(300)}`).search).toHaveLength(100);
  });
});

describe("audit presentation", () => {
  it("keeps null, empty text, the string null, zero and false distinct", () => {
    expect(AuditPresentation.describeValue(null).kind).toBe("none");
    expect(AuditPresentation.describeValue("").kind).toBe("empty");
    expect(AuditPresentation.describeValue("null")).toEqual({ kind: "text", text: "null" });
    expect(AuditPresentation.describeValue("0")).toEqual({ kind: "text", text: "0" });
    expect(AuditPresentation.describeValue("false")).toEqual({ kind: "text", text: "false" });
  });

  it("groups consecutive rows by Dushanbe day, not UTC day", () => {
    const lateUtc = item(3, "2026-10-14T20:30:00Z");
    const earlyLocal = item(2, "2026-10-14T19:30:00Z");
    const previous = item(1, "2026-10-14T18:30:00Z");
    const groups = AuditPresentation.groupByDay([lateUtc, earlyLocal, previous]);
    expect(groups.map((group) => [group.day, group.items.map((entry) => entry.id)])).toEqual([
      ["2026-10-15", [3, 2]],
      ["2026-10-14", [1]],
    ]);
  });

  it("relates days to today and yesterday in the school timezone", () => {
    const reference = new Date("2026-10-16T21:00:00Z");
    expect(getSchoolCalendarDate(reference)).toBe("2026-10-17");
    expect(AuditPresentation.relateDay("2026-10-17", reference)).toBe("today");
    expect(AuditPresentation.relateDay("2026-10-16", reference)).toBe("yesterday");
    expect(AuditPresentation.relateDay("2026-10-15", reference)).toBe("earlier");
  });

  it("classifies change shapes and reference fields so identifiers stay out of row summaries", () => {
    expect(AuditPresentation.changeShape(null, "x")).toBe("set");
    expect(AuditPresentation.changeShape("x", null)).toBe("cleared");
    expect(AuditPresentation.changeShape("", "x")).toBe("changed");
    expect(AuditPresentation.changeShape(null, null)).toBe("changed");
    expect(AuditPresentation.isReferenceField("student_id")).toBe(true);
    expect(AuditPresentation.isReferenceField("amount")).toBe(false);
  });

  it("normalizes serialized enum members only for lookup", () => {
    expect(AuditPresentation.enumLookupKey("PaymentMethod.CASH")).toBe("cash");
    expect(AuditPresentation.enumLookupKey("cash")).toBe("cash");
    expect(AuditPresentation.enumLookupKey("Some text. Another")).toBe("Some text. Another");
  });

  it("humanizes snake case identifiers only", () => {
    expect(AuditPresentation.isSnakeCaseIdentifier("entry_error")).toBe(true);
    expect(AuditPresentation.isSnakeCaseIdentifier("transfer")).toBe(false);
    expect(AuditPresentation.isSnakeCaseIdentifier("Needs a note_here")).toBe(false);
  });

  it("recognises known actions and humanizes unknown identifiers", () => {
    expect(AuditPresentation.isKnownAction("close_period")).toBe(true);
    expect(AuditPresentation.isKnownAction("teleport")).toBe(false);
    expect(AuditPresentation.humanizeIdentifier("journal_entry")).toBe("Journal entry");
  });
});

describe("recent relative time", () => {
  const now = new Date("2026-10-16T10:00:00Z");
  it("describes the last hour only", () => {
    expect(formatRecentRelativeTime("2026-10-16T09:55:00Z", "en", now)).toBe("5 minutes ago");
    expect(formatRecentRelativeTime("2026-10-16T08:59:00Z", "en", now)).toBeNull();
    expect(formatRecentRelativeTime("2026-10-16T10:05:00Z", "en", now)).toBeNull();
    expect(formatRecentRelativeTime("garbage", "en", now)).toBeNull();
  });
});
