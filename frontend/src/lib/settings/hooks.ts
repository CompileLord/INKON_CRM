import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchOrgSettings, testTelegramBot, updateOrgSettings } from "./endpoints";
import type { OrgSettingsUpdate } from "./types";

export function useOrgSettings(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["settings", "org"],
    queryFn: () => fetchOrgSettings(),
  });
}

export function useUpdateOrgSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: OrgSettingsUpdate) => updateOrgSettings(payload),
    onSuccess: (organization) => {
      queryClient.setQueryData(["settings", "org"], organization);
      queryClient.invalidateQueries({ queryKey: ["settings", "org"] });
    },
  });
}

export function useTestTelegramBot() {
  return useMutation({ mutationFn: () => testTelegramBot() });
}
