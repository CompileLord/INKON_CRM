import { Bell, CalendarClock, ClipboardCheck, ShieldAlert, type LucideIcon } from "lucide-react";
import { isPathAllowed } from "../auth/roleAccess";
import type { Role } from "../users/types";
import type { BadgeStatus } from "../../components/ui/Badge";
import { AuditPresentation, type AuditDayRelation } from "../audit/auditPresentation";
import type { DeliveryLogItem, DeliveryRetryFailure, NotificationLogItem, NotificationStatus, NotificationType } from "./types";

export type NotificationEventKind = "examResult" | "paymentTwoDays" | "paymentOneDay" | "telegramLockout" | "generic";

export interface DeliveryStatusPresentation {
  labelKey: string;
  badgeStatus: BadgeStatus;
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
      queued: { labelKey: "deliveryLog.queued", badgeStatus: "draft", showAttempts: false },
      inflight: { labelKey: "deliveryLog.inflight", badgeStatus: "pending", showAttempts: false },
      sent: { labelKey: "deliveryLog.sent", badgeStatus: "paid", showAttempts: false },
      failed: { labelKey: "deliveryLog.failed", badgeStatus: "overdue", showAttempts: true },
    };
    return known[status] ?? known.queued;
  }

  static categoryIcon(type: string): LucideIcon {
    const icons: Record<NotificationEventKind, LucideIcon> = {
      examResult: ClipboardCheck,
      paymentTwoDays: CalendarClock,
      paymentOneDay: CalendarClock,
      telegramLockout: ShieldAlert,
      generic: Bell,
    };
    return icons[NotificationPresentation.eventKind(type)];
  }

  static canOpenStudent(role: Role | null, userId: number | null, studentId: number | null | undefined): boolean {
    return role !== null && typeof studentId === "number" && isPathAllowed(role, `/students/${studentId}`, userId);
  }

  static canOpenCourse(role: Role | null, userId: number | null, courseId: number | null | undefined): boolean {
    return role !== null && typeof courseId === "number" && isPathAllowed(role, `/courses/${courseId}`, userId);
  }

  static canRetry(item: Pick<DeliveryLogItem, "status">): boolean {
    return item.status === "failed";
  }

  static retryFailure(error: unknown): DeliveryRetryFailure {
    const status: unknown = (error as { status?: unknown } | null)?.status;
    if (status === 409) return "notFailed";
    if (status === 429) return "rateLimited";
    if (status === 404) return "notFound";
    return "generic";
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
