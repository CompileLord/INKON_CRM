import type { PaymentCreatePayload } from "./types";

export class PaymentIdempotencyKeys {
  private signature: string | null = null;
  private key: string | null = null;

  keyFor(payload: PaymentCreatePayload): string {
    const signature: string = JSON.stringify([
      payload.student_id,
      payload.course_id,
      payload.targets ?? null,
      payload.amount,
      payload.paid_at,
      payload.method,
      payload.comment ?? null,
    ]);
    if (this.key === null || this.signature !== signature) {
      this.key = crypto.randomUUID();
      this.signature = signature;
    }
    return this.key;
  }

  release(usedKey: string): void {
    if (this.key === usedKey) {
      this.key = null;
      this.signature = null;
    }
  }
}
