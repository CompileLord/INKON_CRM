import { describe, expect, it } from "vitest";
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
