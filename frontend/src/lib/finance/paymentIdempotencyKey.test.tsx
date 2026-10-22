import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { httpClient } from "../auth/httpClient";
import { useCreatePayment } from "./hooks";
import { PaymentIdempotencyKeys } from "./paymentIdempotencyKey";
import type { PaymentCreatePayload } from "./types";

const mock = new MockAdapter(httpClient);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const payload: PaymentCreatePayload = { student_id: 7, course_id: 11, amount: "100.25", paid_at: "2026-03-01T00:00:00.000Z", method: "cash" };

function headerOf(index: number): string {
  return String(mock.history.post[index].headers?.["Idempotency-Key"]);
}

function renderPaymentHook() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useCreatePayment(), { wrapper });
}

afterEach(() => mock.reset());

describe("payment idempotency keys", () => {
  it("generates a uuid and reuses it for the same payload until released", () => {
    const keys = new PaymentIdempotencyKeys();
    const first = keys.keyFor(payload);
    expect(first).toMatch(UUID_PATTERN);
    expect(keys.keyFor({ ...payload })).toBe(first);
  });

  it("replaces the key when any payment field changes", () => {
    const keys = new PaymentIdempotencyKeys();
    const first = keys.keyFor(payload);
    for (const changed of [{ amount: "100.26" }, { comment: "note" }, { method: "transfer" as const }, { course_id: 12 }, { student_id: 8 }, { paid_at: "2026-03-02T00:00:00.000Z" }]) {
      expect(keys.keyFor({ ...payload, ...changed })).not.toBe(first);
      keys.keyFor(payload);
    }
  });

  it("issues a fresh key after the used key is released", () => {
    const keys = new PaymentIdempotencyKeys();
    const first = keys.keyFor(payload);
    keys.release(first);
    expect(keys.keyFor(payload)).not.toBe(first);
  });

  it("ignores the release of a key that was already replaced", () => {
    const keys = new PaymentIdempotencyKeys();
    const stale = keys.keyFor(payload);
    const current = keys.keyFor({ ...payload, amount: "5.00" });
    keys.release(stale);
    expect(keys.keyFor({ ...payload, amount: "5.00" })).toBe(current);
  });
});

describe("useCreatePayment idempotency header", () => {
  it("reuses the same key when a failed submission is retried", async () => {
    mock.onPost("/finance/payments/").networkErrorOnce();
    mock.onPost("/finance/payments/").replyOnce(500, { detail: "boom" });
    mock.onPost("/finance/payments/").reply(201, { id: 1 });
    const { result } = renderPaymentHook();
    await act(async () => { await result.current.mutateAsync(payload).catch(() => undefined); });
    await act(async () => { await result.current.mutateAsync(payload).catch(() => undefined); });
    await act(async () => { await result.current.mutateAsync(payload); });
    expect(mock.history.post).toHaveLength(3);
    expect(headerOf(0)).toMatch(UUID_PATTERN);
    expect(headerOf(1)).toBe(headerOf(0));
    expect(headerOf(2)).toBe(headerOf(0));
  });

  it("sends the same key for a double submission of the same payload", async () => {
    mock.onPost("/finance/payments/").reply(201, { id: 1 });
    const { result } = renderPaymentHook();
    await act(async () => { await Promise.all([result.current.mutateAsync(payload), result.current.mutateAsync(payload)]); });
    expect(mock.history.post).toHaveLength(2);
    expect(headerOf(1)).toBe(headerOf(0));
  });

  it("uses a new key after a success", async () => {
    mock.onPost("/finance/payments/").reply(201, { id: 1 });
    const { result } = renderPaymentHook();
    await act(async () => { await result.current.mutateAsync(payload); });
    await act(async () => { await result.current.mutateAsync(payload); });
    expect(headerOf(1)).not.toBe(headerOf(0));
  });

  it("uses a new key when the payload changes after a failure", async () => {
    mock.onPost("/finance/payments/").replyOnce(500).onPost("/finance/payments/").reply(201, { id: 1 });
    const { result } = renderPaymentHook();
    await act(async () => { await result.current.mutateAsync(payload).catch(() => undefined); });
    await act(async () => { await result.current.mutateAsync({ ...payload, amount: "7.00" }); });
    expect(headerOf(1)).not.toBe(headerOf(0));
  });
});
