import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchOrgSettings, updateOrgSettings } from "./endpoints";
import type { OrgSettingsUpdate } from "./types";

export function useOrgSettings() {
  return useQuery({
    queryKey: ["settings", "org"],
    queryFn: () => fetchOrgSettings(),
  });
}

export function useUpdateOrgSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: OrgSettingsUpdate) => updateOrgSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "org"] });
    },
  });
}
