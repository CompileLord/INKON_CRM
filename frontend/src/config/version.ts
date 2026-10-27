declare const __APP_VERSION__: string | undefined;
declare const __COMMIT_HASH__: string | undefined;
declare const __COMMIT_MESSAGE__: string | undefined;
declare const __BUILD_TIME__: string | undefined;

export const UNKNOWN_BUILD_VALUE = "unknown";

export const APP_VERSION: string = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.1";
export const COMMIT_HASH: string = typeof __COMMIT_HASH__ !== "undefined" ? __COMMIT_HASH__ : "dev";
export const COMMIT_MESSAGE: string = typeof __COMMIT_MESSAGE__ !== "undefined" ? __COMMIT_MESSAGE__ : UNKNOWN_BUILD_VALUE;
export const BUILD_TIME: string = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : UNKNOWN_BUILD_VALUE;
export const FULL_VERSION_STRING = `v${APP_VERSION} (${COMMIT_HASH})`;
export const APP_ENVIRONMENT: "production" | "development" = import.meta.env.PROD ? "production" : "development";
