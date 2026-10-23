import { AuditPresentation, type AuditDayRelation } from "../audit/auditPresentation";
import type { NotificationLogItem, NotificationStatus, NotificationType } from "./types";

export type NotificationEventKind = "examResult" | "paymentTwoDays" | "paymentOneDay" | "telegramLockout" | "generic";

export interface DeliveryStatusPresentation {
  labelKey: string;
  toneClassName: string;
  showAttempts: boolean;
}

export interface NotificationDayGroup {
  day: string;
  items: NotificationLogItem[];
}

export class NotificationPresentation {
  static eventKind(type: string): NotificationEventKind {
    const known: Record<NotificationType, NotificationEventKind> = {
      exam_result: "examResult",
      payment_reminder_2d: "paymentTwoDays",
      payment_reminder_1d: "paymentOneDay",
      telegram_link_lockout: "telegramLockout",
    };
    return known[type as NotificationType] ?? "generic";
  }

  static deliveryStatus(status: NotificationStatus): DeliveryStatusPresentation {
    const known: Record<NotificationStatus, DeliveryStatusPresentation> = {
      queued: { labelKey: "deliveryLog.queued", toneClassName: "bg-beige text-muted", showAttempts: false },
      inflight: { labelKey: "deliveryLog.inflight", toneClassName: "bg-info-surface text-info", showAttempts: false },
      sent: { labelKey: "deliveryLog.sent", toneClassName: "bg-success-surface text-success", showAttempts: false },
      failed: { labelKey: "deliveryLog.failed", toneClassName: "bg-danger-surface text-destructive", showAttempts: true },
    };
    return known[status] ?? known.queued;
  }

  static isDelivered(item: Pick<NotificationLogItem, "status">): boolean {
    return item.status === "sent";
  }

  static groupByDay(items: readonly NotificationLogItem[]): NotificationDayGroup[] {
    const groups: NotificationDayGroup[] = [];
    for (const item of items) {
      const last: NotificationDayGroup | undefined = groups[groups.length - 1];
      if (last && last.day === item.notification_date) last.items.push(item);
      else groups.push({ day: item.notification_date, items: [item] });
    }
    return groups;
  }

  static relateDay(day: string, reference: Date = new Date()): AuditDayRelation {
    return AuditPresentation.relateDay(day, reference);
  }

  static countUnread(items: readonly NotificationLogItem[]): number {
    return items.filter((item) => item.read_at === null).length;
  }
}
