declare const __APP_VERSION__: string | undefined;
declare const __COMMIT_HASH__: string | undefined;

export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.1";
export const COMMIT_HASH = typeof __COMMIT_HASH__ !== "undefined" ? __COMMIT_HASH__ : "dev";
export const FULL_VERSION_STRING = `v${APP_VERSION} (${COMMIT_HASH})`;
