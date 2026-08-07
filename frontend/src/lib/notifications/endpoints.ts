import { httpClient } from "../auth/httpClient";
import type { NotificationLogItem, PaginatedNotifications, UnreadCountResponse } from "./types";

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
