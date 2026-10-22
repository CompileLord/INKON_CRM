export interface BuildInfo {
  version: string;
  commit_sha: string | null;
  commit_message: string | null;
  built_at: string | null;
}
