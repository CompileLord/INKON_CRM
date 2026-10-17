import { useQuery } from "@tanstack/react-query";
import { fetchServerBuildInfo } from "./endpoints";

export function useServerBuildInfo() {
  return useQuery({
    queryKey: ["system", "version"],
    queryFn: () => fetchServerBuildInfo(),
  });
}
