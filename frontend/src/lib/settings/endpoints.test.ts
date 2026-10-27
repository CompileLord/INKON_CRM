import { afterEach, describe, expect, it } from "vitest";
import MockAdapter from "axios-mock-adapter";
import { httpClient } from "../auth/httpClient";
import { updateOrgSettings } from "./endpoints";
import type { OrgSettingsUpdate } from "./types";
const mock: MockAdapter = new MockAdapter(httpClient);
afterEach((): void => mock.reset());
describe("strict organization payload", (): void => {
  it("allowlists only patchable fields from a full response and preserves false", async (): Promise<void> => {
    mock.onPatch("/settings/org").reply(200, {});
    const payload: OrgSettingsUpdate & { updated_at: string; currency: string } = { org_name: "Kitob", notify_payments: false, updated_at: "yesterday", currency: "TJS" };
    await updateOrgSettings(payload);
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ org_name: "Kitob", notify_payments: false });
  });
  it("preserves omitted versus explicit null fields", async (): Promise<void> => {
    mock.onPatch("/settings/org").reply(200, {});
    await updateOrgSettings({ org_name: null });
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ org_name: null });
  });
  it("sends address and phone and sends null when they are cleared", async (): Promise<void> => {
    mock.onPatch("/settings/org").reply(200, {});
    await updateOrgSettings({ address: "Dushanbe, Rudaki 1", phone: "+992901234567" });
    await updateOrgSettings({ address: null, phone: null });
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ address: "Dushanbe, Rudaki 1", phone: "+992901234567" });
    expect(JSON.parse(mock.history.patch[1].data)).toEqual({ address: null, phone: null });
  });
});
