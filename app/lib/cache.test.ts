import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { readCache, writeCache, isCacheStale, invalidateCache } from "./cache";
import type { ActivityItem } from "./types";

const TEST_CACHE_DIR = path.join(process.cwd(), ".cache-test");

const sampleItems: ActivityItem[] = [
  {
    id: "commit-1",
    type: "commit",
    source: "github",
    timestamp: "2026-04-06T10:00:00Z",
    title: "Fix login bug",
  },
  {
    id: "meeting-1",
    type: "meeting",
    source: "google-calendar",
    timestamp: "2026-04-07T14:00:00Z",
    title: "Sprint planning",
    description: "Weekly sprint planning meeting",
  },
];

beforeEach(() => {
  fs.mkdirSync(TEST_CACHE_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
});

describe("writeCache / readCache", () => {
  it("writes and reads back activity items", () => {
    writeCache("github", "2026-04-06", sampleItems, TEST_CACHE_DIR);
    const result = readCache("github", "2026-04-06", TEST_CACHE_DIR);
    expect(result).toEqual(sampleItems);
  });

  it("returns null when no cache file exists", () => {
    const result = readCache("github", "2026-04-06", TEST_CACHE_DIR);
    expect(result).toBeNull();
  });

  it("stores different sources independently", () => {
    const slackItems: ActivityItem[] = [
      {
        id: "slack-1",
        type: "slack-message",
        source: "slack",
        timestamp: "2026-04-06T09:00:00Z",
        title: "Discussed deployment",
      },
    ];

    writeCache("github", "2026-04-06", sampleItems, TEST_CACHE_DIR);
    writeCache("slack", "2026-04-06", slackItems, TEST_CACHE_DIR);

    expect(readCache("github", "2026-04-06", TEST_CACHE_DIR)).toEqual(sampleItems);
    expect(readCache("slack", "2026-04-06", TEST_CACHE_DIR)).toEqual(slackItems);
  });

  it("stores different weeks independently", () => {
    const week2Items: ActivityItem[] = [
      {
        id: "commit-2",
        type: "commit",
        source: "github",
        timestamp: "2026-04-13T10:00:00Z",
        title: "Add feature",
      },
    ];

    writeCache("github", "2026-04-06", sampleItems, TEST_CACHE_DIR);
    writeCache("github", "2026-04-13", week2Items, TEST_CACHE_DIR);

    expect(readCache("github", "2026-04-06", TEST_CACHE_DIR)).toEqual(sampleItems);
    expect(readCache("github", "2026-04-13", TEST_CACHE_DIR)).toEqual(week2Items);
  });

  it("overwrites existing cache on write", () => {
    writeCache("github", "2026-04-06", sampleItems, TEST_CACHE_DIR);
    const newItems: ActivityItem[] = [
      {
        id: "commit-3",
        type: "commit",
        source: "github",
        timestamp: "2026-04-06T12:00:00Z",
        title: "Updated item",
      },
    ];
    writeCache("github", "2026-04-06", newItems, TEST_CACHE_DIR);
    expect(readCache("github", "2026-04-06", TEST_CACHE_DIR)).toEqual(newItems);
  });
});

describe("isCacheStale / invalidateCache", () => {
  it("cache is not stale immediately after writing", () => {
    writeCache("github", "2026-04-06", sampleItems, TEST_CACHE_DIR);
    expect(isCacheStale("github", "2026-04-06", TEST_CACHE_DIR)).toBe(false);
  });

  it("cache is stale when no cache file exists", () => {
    expect(isCacheStale("github", "2026-04-06", TEST_CACHE_DIR)).toBe(true);
  });

  it("cache becomes stale after invalidation", () => {
    writeCache("github", "2026-04-06", sampleItems, TEST_CACHE_DIR);
    invalidateCache("github", "2026-04-06", TEST_CACHE_DIR);
    expect(isCacheStale("github", "2026-04-06", TEST_CACHE_DIR)).toBe(true);
  });

  it("invalidating one source does not affect another", () => {
    writeCache("github", "2026-04-06", sampleItems, TEST_CACHE_DIR);
    writeCache("slack", "2026-04-06", sampleItems, TEST_CACHE_DIR);
    invalidateCache("github", "2026-04-06", TEST_CACHE_DIR);

    expect(isCacheStale("github", "2026-04-06", TEST_CACHE_DIR)).toBe(true);
    expect(isCacheStale("slack", "2026-04-06", TEST_CACHE_DIR)).toBe(false);
  });

  it("invalidating one week does not affect another", () => {
    writeCache("github", "2026-04-06", sampleItems, TEST_CACHE_DIR);
    writeCache("github", "2026-04-13", sampleItems, TEST_CACHE_DIR);
    invalidateCache("github", "2026-04-06", TEST_CACHE_DIR);

    expect(isCacheStale("github", "2026-04-06", TEST_CACHE_DIR)).toBe(true);
    expect(isCacheStale("github", "2026-04-13", TEST_CACHE_DIR)).toBe(false);
  });
});
