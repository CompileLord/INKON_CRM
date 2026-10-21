import { httpClient } from "../auth/httpClient";
import type { OrgSettings, OrgSettingsUpdate, TelegramBotCheck } from "./types";

export function fetchOrgSettings(): Promise<OrgSettings> {
  return httpClient
    .get<OrgSettings>("/settings/org")
    .then((res) => res.data);
}

export function updateOrgSettings(payload: OrgSettingsUpdate): Promise<OrgSettings> {
  const allowed: OrgSettingsUpdate = {};
  if (payload.org_name !== undefined) allowed.org_name = payload.org_name;
  if (payload.notify_payments !== undefined) allowed.notify_payments = payload.notify_payments;
  if (payload.notify_debts !== undefined) allowed.notify_debts = payload.notify_debts;
  return httpClient
    .patch<OrgSettings>("/settings/org", allowed)
    .then((res) => res.data);
}

export function testTelegramBot(): Promise<TelegramBotCheck> {
  return httpClient
    .post<TelegramBotCheck>("/settings/telegram/test")
    .then((res) => res.data);
}
