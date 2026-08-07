import type { Paginated } from "../pagination";

export type NotificationType = "payment_reminder_2d" | "payment_reminder_1d" | "exam_result";
export type NotificationStatus = "sent" | "failed";

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
  error_message: string | null;
}

export type PaginatedNotifications = Paginated<NotificationLogItem>;

export interface UnreadCountResponse {
  unread_count: number;
}
