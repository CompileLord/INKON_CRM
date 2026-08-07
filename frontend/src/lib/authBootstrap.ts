import { useAuthStore } from "../store/authStore";
import { refresh } from "./auth/endpoints";
import { tokenStorage } from "./auth/tokenStorage";

/** Silent-refresh on app boot so an existing session survives a page reload. */
export async function bootstrapAuth(): Promise<void> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) {
    useAuthStore.getState().setUnauthenticated();
    return;
  }

  try {
    const tokens = await refresh(refreshToken);
    // must_set_password isn't meaningful from a bare refresh — treat a
    // restored session as fully set up either way.
    useAuthStore.getState().setAuthenticated(tokens.access_token, tokens.refresh_token, false);
  } catch {
    useAuthStore.getState().setUnauthenticated();
  }
}
