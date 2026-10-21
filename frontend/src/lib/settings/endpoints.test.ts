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
});
