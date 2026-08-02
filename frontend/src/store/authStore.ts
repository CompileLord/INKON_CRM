import { create } from "zustand";
import { onLogout } from "../lib/auth/session";
import { tokenStorage } from "../lib/auth/tokenStorage";
import { decodeAccessToken } from "../lib/auth/jwt";
import type { Role } from "../lib/users/types";

export type AuthStatus = "initializing" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  mustSetPassword: boolean;
  role: Role | null;
  userId: number | null;
  setAuthenticated: (
    accessToken: string,
    refreshToken: string | null,
    mustSetPassword: boolean,
  ) => void;
  setUnauthenticated: () => void;
  completePasswordSetup: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "initializing",
  mustSetPassword: false,
  role: null,
  userId: null,
  setAuthenticated: (accessToken, refreshToken, mustSetPassword) => {
    tokenStorage.setTokens({ accessToken, refreshToken });
    const payload = decodeAccessToken(accessToken);
    set({
      status: "authenticated",
      mustSetPassword,
      role: payload?.role ?? null,
      userId: payload?.user_id ?? null,
    });
  },
  setUnauthenticated: () => {
    tokenStorage.clear();
    set({ status: "unauthenticated", mustSetPassword: false, role: null, userId: null });
  },
  completePasswordSetup: () => set({ mustSetPassword: false }),
}));

// The axios refresh interceptor emits this when a 401 can't be recovered
// (refresh token missing/expired) so the session ends even for requests that
// aren't driven by a user action.
onLogout(() => useAuthStore.getState().setUnauthenticated());
