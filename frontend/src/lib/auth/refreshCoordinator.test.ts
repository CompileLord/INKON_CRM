import { describe, expect, it, vi } from "vitest";
import { AuthApiError, NetworkError } from "./errors";
import { RefreshCoordinator, SessionChangedError, type RefreshBus, type RefreshLockManager, type SharedAccessToken } from "./refreshCoordinator";
import type { TokenPair } from "./types";

class FakeLockManager implements RefreshLockManager {
  private tail: Promise<unknown> = Promise.resolve();

  request<T>(_name: string, callback: () => Promise<T>): Promise<T> {
    const run: Promise<T> = this.tail.then(callback, callback);
    this.tail = run.catch(() => undefined);
    return run;
  }
}

class FakeBus {
  private readonly listeners: Map<number, (message: SharedAccessToken) => void> = new Map();
  private nextId: number = 0;

  endpoint(): RefreshBus {
    const id: number = this.nextId++;
    return {
      post: (message: SharedAccessToken): void => {
        for (const [listenerId, listener] of this.listeners) if (listenerId !== id) listener(message);
      },
      subscribe: (listener: (message: SharedAccessToken) => void): (() => void) => {
        this.listeners.set(id, listener);
        return (): void => {
          this.listeners.delete(id);
        };
      },
    };
  }
}

class SharedBackend {
  storedRefreshToken: string | null = "refresh-0";
  validRefreshToken: string = "refresh-0";
  requestCount: number = 0;
  generation: number = 0;
  failWith: Error | null = null;

  request = async (refreshToken: string): Promise<TokenPair> => {
    this.requestCount += 1;
    await Promise.resolve();
    if (this.failWith) throw this.failWith;
    if (refreshToken !== this.validRefreshToken) throw new AuthApiError(401, "Invalid refresh token");
    this.generation += 1;
    this.validRefreshToken = `refresh-${this.generation}`;
    return { access_token: `access-${this.generation}`, refresh_token: this.validRefreshToken, token_type: "bearer", must_set_password: false };
  };
}

interface Tab {
  coordinator: RefreshCoordinator;
  applied: TokenPair[];
}

function openTab(backend: SharedBackend, locks: RefreshLockManager, bus: FakeBus): Tab {
  const applied: TokenPair[] = [];
  const coordinator: RefreshCoordinator = new RefreshCoordinator({
    locks,
    bus: bus.endpoint(),
    readRefreshToken: (): string | null => backend.storedRefreshToken,
    requestRefresh: backend.request,
    persist: (tokens: TokenPair): void => {
      backend.storedRefreshToken = tokens.refresh_token;
    },
    apply: (tokens: TokenPair): void => {
      applied.push(tokens);
    },
    now: (): number => Date.now(),
  });
  return { coordinator, applied };
}

describe("RefreshCoordinator across tabs", () => {
  it("sends one refresh request for two simultaneous tabs and shares the new tokens", async () => {
    const backend: SharedBackend = new SharedBackend();
    const locks: FakeLockManager = new FakeLockManager();
    const bus: FakeBus = new FakeBus();
    const tabA: Tab = openTab(backend, locks, bus);
    const tabB: Tab = openTab(backend, locks, bus);

    const [first, second]: TokenPair[] = await Promise.all([tabA.coordinator.refresh(), tabB.coordinator.refresh()]);

    expect(backend.requestCount).toBe(1);
    expect(first.access_token).toBe("access-1");
    expect(second.access_token).toBe("access-1");
    expect(second.refresh_token).toBe("refresh-1");
    expect(backend.storedRefreshToken).toBe("refresh-1");
    expect(tabA.applied).toHaveLength(1);
    expect(tabB.applied).toHaveLength(1);
  });

  it("shares one in-flight refresh inside a single tab", async () => {
    const backend: SharedBackend = new SharedBackend();
    const tab: Tab = openTab(backend, new FakeLockManager(), new FakeBus());
    await Promise.all([tab.coordinator.refresh(), tab.coordinator.refresh(), tab.coordinator.refresh()]);
    expect(backend.requestCount).toBe(1);
    expect(tab.applied).toHaveLength(1);
  });

  it("re-reads the stored token and retries once when another tab already rotated it", async () => {
    const backend: SharedBackend = new SharedBackend();
    const originalRequest = backend.request;
    let first: boolean = true;
    const rotatingRequest = async (token: string): Promise<TokenPair> => {
      if (first) {
        first = false;
        backend.validRefreshToken = "refresh-other-tab";
        backend.storedRefreshToken = "refresh-other-tab";
      }
      return originalRequest(token);
    };
    const coordinator: RefreshCoordinator = new RefreshCoordinator({
      locks: new FakeLockManager(),
      bus: null,
      readRefreshToken: (): string | null => backend.storedRefreshToken,
      requestRefresh: rotatingRequest,
      persist: (tokens: TokenPair): void => {
        backend.storedRefreshToken = tokens.refresh_token;
      },
      apply: vi.fn(),
      now: (): number => Date.now(),
    });
    const tokens: TokenPair = await coordinator.refresh();
    expect(tokens.access_token).toBe("access-1");
    expect(backend.requestCount).toBe(2);
  });

  it("does not persist tokens when the session was cleared while the request was pending", async () => {
    const backend: SharedBackend = new SharedBackend();
    const persist = vi.fn();
    const coordinator: RefreshCoordinator = new RefreshCoordinator({
      locks: new FakeLockManager(),
      bus: null,
      readRefreshToken: (): string | null => backend.storedRefreshToken,
      requestRefresh: async (token: string): Promise<TokenPair> => {
        backend.storedRefreshToken = null;
        return backend.request(token);
      },
      persist,
      apply: vi.fn(),
      now: (): number => Date.now(),
    });
    await expect(coordinator.refresh()).rejects.toBeInstanceOf(SessionChangedError);
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects with 401 and does not retry when the token was reused and nobody rotated it", async () => {
    const backend: SharedBackend = new SharedBackend();
    backend.validRefreshToken = "someone-else";
    const tab: Tab = openTab(backend, new FakeLockManager(), new FakeBus());
    await expect(tab.coordinator.refresh()).rejects.toMatchObject({ status: 401 });
    expect(backend.requestCount).toBe(1);
    expect(tab.applied).toHaveLength(0);
  });

  it("propagates an outage without touching the stored token", async () => {
    const backend: SharedBackend = new SharedBackend();
    backend.failWith = new NetworkError();
    const tab: Tab = openTab(backend, new FakeLockManager(), new FakeBus());
    await expect(tab.coordinator.refresh()).rejects.toBeInstanceOf(NetworkError);
    expect(backend.storedRefreshToken).toBe("refresh-0");
  });

  it("serializes tabs through the storage lease when Web Locks are unavailable", async () => {
    localStorage.clear();
    const backend: SharedBackend = new SharedBackend();
    const bus: FakeBus = new FakeBus();
    const tabA: Tab = openTab(backend, null as unknown as RefreshLockManager, bus);
    const tabB: Tab = openTab(backend, null as unknown as RefreshLockManager, bus);
    await Promise.all([tabA.coordinator.refresh(), tabB.coordinator.refresh()]);
    expect(backend.requestCount).toBe(1);
    expect(backend.storedRefreshToken).toBe("refresh-1");
    expect(localStorage.getItem("imkon-auth-refresh-lease")).toBeNull();
  });
});
