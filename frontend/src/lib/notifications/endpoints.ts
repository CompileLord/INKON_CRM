import { httpClient } from "../auth/httpClient";
import type { MarkAllReadResponse, NotificationLogItem, NotificationStatus, PaginatedDeliveryLog, PaginatedNotifications, UnreadCountResponse } from "./types";

export function fetchNotifications(page = 1, pageSize = 20): Promise<PaginatedNotifications> {
  return httpClient
    .get<PaginatedNotifications>("/notifications/", {
      params: { page, page_size: pageSize },
    })
    .then((res) => res.data);
}

export function fetchUnreadNotificationCount(): Promise<UnreadCountResponse> {
  return httpClient
    .get<UnreadCountResponse>("/notifications/unread-count")
    .then((res) => res.data);
}

export function markNotificationRead(id: number): Promise<NotificationLogItem> {
  return httpClient
    .patch<NotificationLogItem>(`/notifications/${id}/read`)
    .then((res) => res.data);
}

export function markAllNotificationsRead(): Promise<MarkAllReadResponse> {
  return httpClient
    .post<MarkAllReadResponse>("/notifications/read-all")
    .then((res) => res.data);
}

export function fetchDeliveryLog(page = 1, pageSize = 20, status?: NotificationStatus): Promise<PaginatedDeliveryLog> {
  return httpClient
    .get<PaginatedDeliveryLog>("/notifications/delivery-log", {
      params: { page, page_size: pageSize, ...(status ? { status } : {}) },
    })
    .then((res) => res.data);
}
