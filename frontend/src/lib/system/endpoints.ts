import { httpClient } from "../auth/httpClient";
import type { BuildInfo } from "./types";

export function fetchServerBuildInfo(): Promise<BuildInfo> {
  return httpClient
    .get<BuildInfo>("/system/version")
    .then((res) => res.data);
}
