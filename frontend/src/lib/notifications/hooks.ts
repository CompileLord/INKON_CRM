import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchNotifications, fetchUnreadNotificationCount, markNotificationRead } from "./endpoints";

export function useNotifications(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ["notifications", "list", page, pageSize],
    queryFn: () => fetchNotifications(page, pageSize),
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => fetchUnreadNotificationCount(),
    refetchInterval: 30000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
