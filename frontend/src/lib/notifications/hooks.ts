import { useAuthStore } from "../../store/authStore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchNotifications, fetchUnreadNotificationCount, markNotificationRead } from "./endpoints";

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
