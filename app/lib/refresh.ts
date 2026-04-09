import { invalidateCache } from "./cache";
import type { ActivitySource } from "./types";

const ALL_SOURCES: ActivitySource[] = [
  "github",
  "slack",
  "google-calendar",
  "jira",
  "claude-code",
];

export function refreshAll(weekKey: string, cacheDir?: string): void {
  for (const source of ALL_SOURCES) {
    invalidateCache(source, weekKey, cacheDir);
  }
}
