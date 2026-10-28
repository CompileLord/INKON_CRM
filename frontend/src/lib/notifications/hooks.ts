import { useAuthStore } from "../../store/authStore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDeliveryLog, fetchNotifications, fetchUnreadNotificationCount, markAllNotificationsRead, markNotificationRead, retryDeliveryLog } from "./endpoints";
import type { DeliveryLogItem, NotificationStatus } from "./types";

export function useNotifications(page = 1, pageSize = 20) {
  const userId = useAuthStore((state) => state.userId);
  return useQuery({
    enabled: userId !== null,
    queryKey: ["notifications", userId, "list", page, pageSize],
    queryFn: () => fetchNotifications(page, pageSize),
  });
}

export function useUnreadNotificationCount() {
  const userId = useAuthStore((state) => state.userId);
  return useQuery({
    enabled: userId !== null,
    queryKey: ["notifications", userId, "unread-count"],
    queryFn: () => fetchUnreadNotificationCount(),
    refetchInterval: 30000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.userId);

  return useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: (notification) => {
      queryClient.setQueriesData<import("./types").PaginatedNotifications>({ queryKey: ["notifications", userId, "list"] }, (data) => data ? { ...data, items: data.items.map((item) => item.id === notification.id ? notification : item) } : data);
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.userId);

  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", userId] }),
  });
}

export function useDeliveryLog(enabled: boolean, page = 1, status?: NotificationStatus, pageSize = 20) {
  const userId = useAuthStore((state) => state.userId);
  return useQuery({
    enabled: enabled && userId !== null,
    queryKey: ["notifications", userId, "delivery-log", page, pageSize, status ?? "all"],
    queryFn: () => fetchDeliveryLog(page, pageSize, status),
  });
}

export function useRetryDelivery() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.userId);

  return useMutation({
    mutationFn: (id: number) => retryDeliveryLog(id),
    onSuccess: (updated: DeliveryLogItem) => {
      queryClient.setQueriesData<import("./types").PaginatedDeliveryLog>({ queryKey: ["notifications", userId, "delivery-log"] }, (data) => data ? { ...data, items: data.items.map((item) => item.id === updated.id ? updated : item) } : data);
      return queryClient.invalidateQueries({ queryKey: ["notifications", userId, "delivery-log"] });
    },
  });
}
