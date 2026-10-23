import { create } from "zustand";
import { onLogout, onSessionRefresh } from "../lib/auth/session";
import { tokenStorage } from "../lib/auth/tokenStorage";
import { decodeAccessToken } from "../lib/auth/jwt";
import type { Role } from "../lib/users/types";

export type AuthStatus = "initializing" | "authenticated" | "unauthenticated" | "unavailable";

export interface AuthState {
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
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "initializing",
  mustSetPassword: false,
  role: null,
  userId: null,
  setAuthenticated: (accessToken, refreshToken, mustSetPassword) => {
    const payload = decodeAccessToken(accessToken);
    if (!payload) {
      tokenStorage.clear();
      set({ status: "unauthenticated", mustSetPassword: false, role: null, userId: null });
      throw new Error("Invalid authentication identity");
    }
    tokenStorage.setTokens({ accessToken, refreshToken });
    set({
      status: "authenticated",
      mustSetPassword: mustSetPassword || payload.mustSetPassword,
      role: payload.role,
      userId: payload.userId,
    });
  },
  setUnauthenticated: () => {
    tokenStorage.clear();
    set({ status: "unauthenticated", mustSetPassword: false, role: null, userId: null });
  },
}));

onLogout(() => useAuthStore.getState().setUnauthenticated());
onSessionRefresh((tokens) => useAuthStore.getState().setAuthenticated(tokens.access_token, tokens.refresh_token, tokens.must_set_password));
