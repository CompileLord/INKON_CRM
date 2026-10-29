import type { Paginated } from "../pagination";

export type NotificationType = "payment_reminder_2d" | "payment_reminder_1d" | "exam_result" | "telegram_link_lockout";
export type NotificationStatus = "queued" | "inflight" | "sent" | "failed";

export interface NotificationLogItem {
  id: number;
  user_id: number | null;
  recipient: string;
  type: NotificationType;
  related_entity_id: number;
  notification_date: string;
  status: NotificationStatus;
  attempts: number;
  sent_at: string | null;
  read_at: string | null;
}

export type PaginatedNotifications = Paginated<NotificationLogItem>;

export interface UnreadCountResponse {
  unread_count: number;
}

export interface MarkAllReadResponse {
  updated_count: number;
}

export interface DeliveryLogItem {
  id: number;
  recipient_name?: string | null;
  type: NotificationType | "debt_reminder_sms";
  notification_date: string;
  status: NotificationStatus;
  attempts: number;
  sent_at: string | null;
  student_id?: number | null;
  course_id?: number | null;
  course_title?: string | null;
  amount?: string | null;
  score?: number | null;
  reason?: string | null;
  outbox_status?: "pending" | "claimed" | "delivered" | "failed" | "expired" | null;
}

export type DeliveryRetryFailure = "notFailed" | "rateLimited" | "notFound" | "generic";

export type PaginatedDeliveryLog = Paginated<DeliveryLogItem>;
