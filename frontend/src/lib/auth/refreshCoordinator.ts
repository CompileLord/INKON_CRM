import { AuthApiError } from "./errors";
import type { TokenPair } from "./types";

export interface RefreshLockManager {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export interface RefreshBus {
  post(message: SharedAccessToken): void;
  subscribe(listener: (message: SharedAccessToken) => void): () => void;
}

export interface SharedAccessToken {
  accessToken: string;
  mustSetPassword: boolean;
  tokenType: string;
  sentAt: number;
}

export interface RefreshCoordinatorDependencies {
  locks: RefreshLockManager | null;
  bus: RefreshBus | null;
  readRefreshToken: () => string | null;
  requestRefresh: (refreshToken: string) => Promise<TokenPair>;
  persist: (tokens: TokenPair) => void;
  apply: (tokens: TokenPair) => void;
  now: () => number;
}

export class SessionChangedError extends Error {
  constructor() {
    super("Session changed while refreshing");
    this.name = "SessionChangedError";
  }
}

export class MissingRefreshTokenError extends Error {
  constructor() {
    super("No refresh token available");
    this.name = "MissingRefreshTokenError";
  }
}

interface RotationOutcome {
  tokens: TokenPair;
  usedToken: string;
}

const LOCK_NAME: string = "imkon-auth-refresh";
const LEASE_KEY: string = "imkon-auth-refresh-lease";
const LEASE_DURATION_MS: number = 15_000;
const LEASE_POLL_MS: number = 40;
const CHANNEL_NAME: string = "imkon-auth-refresh-channel";

export class RefreshCoordinator {
  private inFlight: Promise<TokenPair> | null = null;
  private latestShared: SharedAccessToken | null = null;

  private readonly dependencies: RefreshCoordinatorDependencies;

  constructor(dependencies: RefreshCoordinatorDependencies) {
    this.dependencies = dependencies;
    dependencies.bus?.subscribe((message: SharedAccessToken): void => {
      if (this.latestShared === null || message.sentAt >= this.latestShared.sentAt) this.latestShared = message;
    });
  }

  refresh(): Promise<TokenPair> {
    this.inFlight ??= this.refreshAcrossTabs()
      .then((tokens: TokenPair): TokenPair => {
        this.dependencies.apply(tokens);
        return tokens;
      })
      .finally((): void => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private async refreshAcrossTabs(): Promise<TokenPair> {
    const startedAt: number = this.dependencies.now();
    const tokenAtStart: string | null = this.dependencies.readRefreshToken();
    if (tokenAtStart === null) throw new MissingRefreshTokenError();
    const { locks } = this.dependencies;
    if (locks) return locks.request(LOCK_NAME, () => this.refreshUnderLock(startedAt, tokenAtStart));
    return this.withStorageLease(() => this.refreshUnderLock(startedAt, tokenAtStart));
  }

  private async refreshUnderLock(startedAt: number, tokenAtStart: string): Promise<TokenPair> {
    const currentToken: string | null = this.dependencies.readRefreshToken();
    if (currentToken === null) throw new MissingRefreshTokenError();
    const shared: SharedAccessToken | null = this.latestShared;
    if (currentToken !== tokenAtStart && shared !== null && shared.sentAt >= startedAt) {
      return {
        access_token: shared.accessToken,
        refresh_token: currentToken,
        token_type: shared.tokenType,
        must_set_password: shared.mustSetPassword,
      };
    }
    const outcome: RotationOutcome = await this.requestWithRotationRetry(currentToken);
    const tokens: TokenPair = outcome.tokens;
    if (this.dependencies.readRefreshToken() !== outcome.usedToken) throw new SessionChangedError();
    this.dependencies.persist(tokens);
    const message: SharedAccessToken = {
      accessToken: tokens.access_token,
      mustSetPassword: tokens.must_set_password,
      tokenType: tokens.token_type,
      sentAt: this.dependencies.now(),
    };
    this.latestShared = message;
    this.dependencies.bus?.post(message);
    return tokens;
  }

  private async requestWithRotationRetry(usedToken: string): Promise<RotationOutcome> {
    try {
      return { tokens: await this.dependencies.requestRefresh(usedToken), usedToken };
    } catch (error: unknown) {
      const storedToken: string | null = this.dependencies.readRefreshToken();
      const rotatedElsewhere: boolean = storedToken !== null && storedToken !== usedToken;
      if (storedToken !== null && rotatedElsewhere && error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
        return { tokens: await this.dependencies.requestRefresh(storedToken), usedToken: storedToken };
      }
      throw error;
    }
  }

  private async withStorageLease<T>(task: () => Promise<T>): Promise<T> {
    const ownerId: string = `${this.dependencies.now()}-${Math.random().toString(36).slice(2)}`;
    const deadline: number = this.dependencies.now() + LEASE_DURATION_MS;
    while (!this.tryAcquireLease(ownerId) && this.dependencies.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, LEASE_POLL_MS));
    }
    try {
      return await task();
    } finally {
      this.releaseLease(ownerId);
    }
  }

  private tryAcquireLease(ownerId: string): boolean {
    try {
      const raw: string | null = localStorage.getItem(LEASE_KEY);
      if (raw !== null) {
        const [, expiresAt] = raw.split("|");
        if (Number(expiresAt) > this.dependencies.now()) return false;
      }
      localStorage.setItem(LEASE_KEY, `${ownerId}|${this.dependencies.now() + LEASE_DURATION_MS}`);
      return localStorage.getItem(LEASE_KEY)?.startsWith(`${ownerId}|`) ?? true;
    } catch {
      return true;
    }
  }

  private releaseLease(ownerId: string): void {
    try {
      if (localStorage.getItem(LEASE_KEY)?.startsWith(`${ownerId}|`)) localStorage.removeItem(LEASE_KEY);
    } catch {
      return;
    }
  }

  static browserLocks(): RefreshLockManager | null {
    const manager: LockManager | undefined = typeof navigator === "undefined" ? undefined : navigator.locks;
    if (!manager) return null;
    return { request: <T>(name: string, callback: () => Promise<T>): Promise<T> => manager.request(name, callback) };
  }

  static browserBus(): RefreshBus | null {
    if (typeof BroadcastChannel === "undefined") return null;
    const channel: BroadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    return {
      post: (message: SharedAccessToken): void => channel.postMessage(message),
      subscribe: (listener: (message: SharedAccessToken) => void): (() => void) => {
        const handler = (event: MessageEvent<SharedAccessToken>): void => listener(event.data);
        channel.addEventListener("message", handler);
        return (): void => channel.removeEventListener("message", handler);
      },
    };
  }
}
