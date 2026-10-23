import { AuthApiError } from "./errors";

export class PasswordPolicyViolation {
  private static readonly MESSAGE_PREFIX: string = "Password must be at least";

  static matches(error: unknown): boolean {
    if (!(error instanceof AuthApiError) || (error.status !== 400 && error.status !== 422)) return false;
    return typeof error.detail === "string" && error.detail.startsWith(PasswordPolicyViolation.MESSAGE_PREFIX);
  }
}
