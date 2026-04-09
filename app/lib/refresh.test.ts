import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { refreshAll } from "./refresh";
import { writeCache, isCacheStale } from "./cache";
import type { ActivityItem, ActivitySource } from "./types";

const TEST_CACHE_DIR = path.join(process.cwd(), ".cache-test-refresh");

const ALL_SOURCES: ActivitySource[] = [
  "github",
  "slack",
  "google-calendar",
  "jira",
  "claude-code",
];

const sampleItem: ActivityItem = {
  id: "test-1",
  type: "commit",
  source: "github",
  timestamp: "2026-04-06T10:00:00Z",
  title: "Test",
};

beforeEach(() => {
  fs.mkdirSync(TEST_CACHE_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
});

describe("refreshAll", () => {
  it("invalidates all sources for a given week", () => {
    for (const source of ALL_SOURCES) {
      writeCache(source, "2026-04-06", [sampleItem], TEST_CACHE_DIR);
    }

    for (const source of ALL_SOURCES) {
      expect(isCacheStale(source, "2026-04-06", TEST_CACHE_DIR)).toBe(false);
    }

    refreshAll("2026-04-06", TEST_CACHE_DIR);

    for (const source of ALL_SOURCES) {
      expect(isCacheStale(source, "2026-04-06", TEST_CACHE_DIR)).toBe(true);
    }
  });

  it("does not affect a different week", () => {
    writeCache("github", "2026-04-06", [sampleItem], TEST_CACHE_DIR);
    writeCache("github", "2026-04-13", [sampleItem], TEST_CACHE_DIR);

    refreshAll("2026-04-06", TEST_CACHE_DIR);

    expect(isCacheStale("github", "2026-04-06", TEST_CACHE_DIR)).toBe(true);
    expect(isCacheStale("github", "2026-04-13", TEST_CACHE_DIR)).toBe(false);
  });
});
