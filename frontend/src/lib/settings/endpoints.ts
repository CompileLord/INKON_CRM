import { httpClient } from "../auth/httpClient";
import type { OrgSettings, OrgSettingsUpdate } from "./types";

export function fetchOrgSettings(): Promise<OrgSettings> {
  return httpClient
    .get<OrgSettings>("/settings/org")
    .then((res) => res.data);
}

export function updateOrgSettings(payload: OrgSettingsUpdate): Promise<OrgSettings> {
  return httpClient
    .patch<OrgSettings>("/settings/org", payload)
    .then((res) => res.data);
}
