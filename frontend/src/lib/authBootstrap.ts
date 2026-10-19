import { useAuthStore } from "../store/authStore";
import { refresh } from "./auth/endpoints";
import { AuthApiError } from "./auth/errors";
import { tokenStorage } from "./auth/tokenStorage";

const TRANSIENT_RETRY_DELAYS_MS: readonly number[] = [500, 1500, 3000];

let pendingBootstrap: Promise<void> | null = null;

function isDefinitiveRejection(error: unknown): boolean {
  return error instanceof AuthApiError && (error.status === 401 || error.status === 403);
}

function waitFor(delayMs: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

async function restoreSession(): Promise<void> {
  const refreshToken: string | null = tokenStorage.getRefreshToken();
  if (!refreshToken) {
    useAuthStore.getState().setUnauthenticated();
    return;
  }
  for (let attempt: number = 0; attempt <= TRANSIENT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const tokens = await refresh(refreshToken);
      if (tokenStorage.getRefreshToken() !== refreshToken) return;
      useAuthStore.getState().setAuthenticated(tokens.access_token, tokens.refresh_token, tokens.must_set_password);
      return;
    } catch (error: unknown) {
      if (tokenStorage.getRefreshToken() !== refreshToken) return;
      if (isDefinitiveRejection(error)) {
        useAuthStore.getState().setUnauthenticated();
        return;
      }
      if (attempt < TRANSIENT_RETRY_DELAYS_MS.length) await waitFor(TRANSIENT_RETRY_DELAYS_MS[attempt]);
    }
  }
  useAuthStore.setState({ status: "unauthenticated", mustSetPassword: false, role: null, userId: null });
}

export function bootstrapAuth(): Promise<void> {
  if (pendingBootstrap) return pendingBootstrap;
  if (useAuthStore.getState().status !== "initializing") return Promise.resolve();
  pendingBootstrap = restoreSession().finally(() => {
    pendingBootstrap = null;
  });
  return pendingBootstrap;
}
