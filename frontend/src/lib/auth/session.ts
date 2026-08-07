type LogoutListener = () => void;

const listeners = new Set<LogoutListener>();

/**
 * Fired when the session ends outside of an explicit user action — i.e. the
 * refresh-token flow failed and tokens were cleared. Keeps httpClient.ts
 * decoupled from the UI layer (Zustand/React); the store subscribes to this
 * to redirect to /login.
 */
export function onLogout(listener: LogoutListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitLogout(): void {
  for (const listener of listeners) listener();
}
