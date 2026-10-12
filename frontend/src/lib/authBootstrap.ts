import { useAuthStore } from "../store/authStore";
import { refresh } from "./auth/endpoints";
import { tokenStorage } from "./auth/tokenStorage";

let pendingBootstrap: Promise<void> | null = null;

async function restoreSession(): Promise<void> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) {
    useAuthStore.getState().setUnauthenticated();
    return;
  }
  try {
    const tokens = await refresh(refreshToken);
    if (tokenStorage.getRefreshToken() !== refreshToken) return;
    useAuthStore.getState().setAuthenticated(tokens.access_token, tokens.refresh_token, tokens.must_set_password);
  } catch {
    if (tokenStorage.getRefreshToken() === refreshToken) useAuthStore.getState().setUnauthenticated();
  }
}

export function bootstrapAuth(): Promise<void> {
  if (pendingBootstrap) return pendingBootstrap;
  if (useAuthStore.getState().status !== "initializing") return Promise.resolve();
  pendingBootstrap = restoreSession().finally(() => {
    pendingBootstrap = null;
  });
  return pendingBootstrap;
}
