import { describe, expect, it } from "vitest";
import { Bell, CalendarClock, ClipboardCheck, ShieldAlert } from "lucide-react";
import { NotificationPresentation } from "./NotificationPresentation";
import type { NotificationLogItem } from "./types";

function item(id: number, notificationDate: string, readAt: string | null = null, type: string = "exam_result"): NotificationLogItem {
  return { id, user_id: 1, recipient: "r", type: type as NotificationLogItem["type"], related_entity_id: 1, notification_date: notificationDate, status: "sent", attempts: 1, sent_at: null, read_at: readAt };
}

describe("NotificationPresentation", () => {
  it("groups consecutive notifications by their calendar day in order", () => {
    const groups = NotificationPresentation.groupByDay([item(1, "2026-10-12"), item(2, "2026-10-12"), item(3, "2026-10-11")]);
    expect(groups.map((group) => [group.day, group.items.map((entry) => entry.id)])).toEqual([["2026-10-12", [1, 2]], ["2026-10-11", [3]]]);
  });

  it("relates days to today and yesterday in the school time zone", () => {
    const reference = new Date("2026-10-12T08:00:00Z");
    expect(NotificationPresentation.relateDay("2026-10-12", reference)).toBe("today");
    expect(NotificationPresentation.relateDay("2026-10-11", reference)).toBe("yesterday");
    expect(NotificationPresentation.relateDay("2026-10-01", reference)).toBe("earlier");
  });

  it("maps supported types and falls back to a neutral kind for unknown types", () => {
    expect(NotificationPresentation.eventKind("exam_result")).toBe("examResult");
    expect(NotificationPresentation.eventKind("payment_reminder_2d")).toBe("paymentTwoDays");
    expect(NotificationPresentation.eventKind("payment_reminder_1d")).toBe("paymentOneDay");
    expect(NotificationPresentation.eventKind("internal_raw_code")).toBe("generic");
  });

  it("counts only items without a read timestamp", () => {
    expect(NotificationPresentation.countUnread([item(1, "2026-10-12"), item(2, "2026-10-12", "2026-10-12T09:00:00Z")])).toBe(1);
  });
});

describe("NotificationPresentation delivery status", () => {
  it("maps each status to its own label key and token tone, with danger only for failed", () => {
    const labels: string[] = (["queued", "inflight", "sent", "failed"] as const).map((status) => NotificationPresentation.deliveryStatus(status).labelKey);
    expect(labels).toEqual(["deliveryLog.queued", "deliveryLog.inflight", "deliveryLog.sent", "deliveryLog.failed"]);
    const badges: string[] = (["queued", "inflight", "sent", "failed"] as const).map((status) => NotificationPresentation.deliveryStatus(status).badgeStatus);
    expect(badges).toEqual(["draft", "pending", "paid", "overdue"]);
  });

  it("treats only sent as delivered", () => {
    expect(NotificationPresentation.isDelivered({ status: "sent" })).toBe(true);
    expect(NotificationPresentation.isDelivered({ status: "queued" })).toBe(false);
  });
});

describe("NotificationPresentation categories, links and retry", () => {
  it("maps each category to its own lucide icon and falls back to a bell", () => {
    expect(NotificationPresentation.categoryIcon("exam_result")).toBe(ClipboardCheck);
    expect(NotificationPresentation.categoryIcon("payment_reminder_2d")).toBe(CalendarClock);
    expect(NotificationPresentation.categoryIcon("payment_reminder_1d")).toBe(CalendarClock);
    expect(NotificationPresentation.categoryIcon("telegram_link_lockout")).toBe(ShieldAlert);
    expect(NotificationPresentation.categoryIcon("mystery")).toBe(Bell);
  });

  it("allows student and course links only where the route guard lets the role in", () => {
    expect(NotificationPresentation.canOpenStudent("superadmin", 1, 5)).toBe(true);
    expect(NotificationPresentation.canOpenCourse("superadmin", 1, 9)).toBe(true);
    expect(NotificationPresentation.canOpenStudent("accountant", 2, 5)).toBe(false);
    expect(NotificationPresentation.canOpenCourse("accountant", 2, 9)).toBe(false);
    expect(NotificationPresentation.canOpenStudent("student", 5, 6)).toBe(false);
    expect(NotificationPresentation.canOpenStudent("student", 5, 5)).toBe(true);
    expect(NotificationPresentation.canOpenCourse("student", 5, 9)).toBe(false);
    expect(NotificationPresentation.canOpenStudent("superadmin", 1, null)).toBe(false);
    expect(NotificationPresentation.canOpenStudent(null, null, 5)).toBe(false);
  });

  it("offers retry only for failed items and maps http statuses to failures", () => {
    expect(NotificationPresentation.canRetry({ status: "failed" })).toBe(true);
    for (const status of ["queued", "inflight", "sent"] as const) expect(NotificationPresentation.canRetry({ status })).toBe(false);
    expect(NotificationPresentation.retryFailure({ status: 409 })).toBe("notFailed");
    expect(NotificationPresentation.retryFailure({ status: 429 })).toBe("rateLimited");
    expect(NotificationPresentation.retryFailure({ status: 404 })).toBe("notFound");
    expect(NotificationPresentation.retryFailure({ status: 500 })).toBe("generic");
    expect(NotificationPresentation.retryFailure(new Error("x"))).toBe("generic");
  });
});
