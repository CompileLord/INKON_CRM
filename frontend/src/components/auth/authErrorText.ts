import type { TFunction } from "i18next";
import { getAuthErrorKind } from "../../lib/auth/errorMessages";

export function authErrorText(error: unknown, t: TFunction): string {
  return t(`auth:${getAuthErrorKind(error)}`);
}
