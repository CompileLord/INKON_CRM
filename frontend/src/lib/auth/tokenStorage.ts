const REFRESH_TOKEN_KEY = "imkon-refresh-token";

/**
 * Token storage behind a small interface so the backend (memory,
 * localStorage, secure storage on a future native shell, ...) can be swapped
 * without touching httpClient.ts or endpoints.ts.
 */
export interface TokenStorage {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  /**
   * Always updates the access token. Only overwrites the stored refresh
   * token when a non-null string is given — the API returns `null` when it
   * didn't rotate the refresh token, which must not wipe out the existing one.
   */
  setTokens(tokens: { accessToken: string; refreshToken?: string | null }): void;
  clear(): void;
}

/** Pure in-memory storage. Useful for tests and SSR; nothing survives a reload. */
export function createMemoryTokenStorage(): TokenStorage {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  return {
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    setTokens: (tokens) => {
      accessToken = tokens.accessToken;
      if (tokens.refreshToken) refreshToken = tokens.refreshToken;
    },
    clear: () => {
      accessToken = null;
      refreshToken = null;
    },
  };
}

/**
 * Default storage: the access token never leaves memory (it's short-lived
 * and shouldn't sit in localStorage); only the refresh token is persisted, so
 * a page reload can silently re-authenticate.
 */
export function createLocalStorageTokenStorage(): TokenStorage {
  let accessToken: string | null = null;

  return {
    getAccessToken: () => accessToken,
    getRefreshToken: () => {
      try {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
      } catch {
        return null;
      }
    },
    setTokens: (tokens) => {
      accessToken = tokens.accessToken;
      if (!tokens.refreshToken) return;
      try {
        localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      } catch {
        // storage unavailable (private mode, quota, etc.) — session just won't persist
      }
    },
    clear: () => {
      accessToken = null;
      try {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      } catch {
        // ignore
      }
    },
  };
}

export const tokenStorage: TokenStorage = createLocalStorageTokenStorage();
