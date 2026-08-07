/**
 * Vite only exposes env vars prefixed VITE_ to client bundles, so the .env
 * key stays VITE_API_BASE_URL; this re-exports it under the plain name the
 * rest of the auth module expects.
 */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";
