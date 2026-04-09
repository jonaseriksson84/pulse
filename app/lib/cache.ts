import * as fs from "node:fs";
import * as path from "node:path";
import type { ActivityItem, ActivitySource } from "./types";

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache");

function getCachePath(
  source: ActivitySource,
  weekKey: string,
  cacheDir: string,
): string {
  return path.join(cacheDir, `${source}_${weekKey}.json`);
}

function getStalePath(
  source: ActivitySource,
  weekKey: string,
  cacheDir: string,
): string {
  return path.join(cacheDir, `${source}_${weekKey}.stale`);
}

export function writeCache(
  source: ActivitySource,
  weekKey: string,
  items: ActivityItem[],
  cacheDir: string = DEFAULT_CACHE_DIR,
): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  const filePath = getCachePath(source, weekKey, cacheDir);
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
  // Remove stale marker if it exists
  const stalePath = getStalePath(source, weekKey, cacheDir);
  if (fs.existsSync(stalePath)) {
    fs.unlinkSync(stalePath);
  }
}

export function readCache(
  source: ActivitySource,
  weekKey: string,
  cacheDir: string = DEFAULT_CACHE_DIR,
): ActivityItem[] | null {
  const filePath = getCachePath(source, weekKey, cacheDir);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as ActivityItem[];
}

export function isCacheStale(
  source: ActivitySource,
  weekKey: string,
  cacheDir: string = DEFAULT_CACHE_DIR,
): boolean {
  const filePath = getCachePath(source, weekKey, cacheDir);
  if (!fs.existsSync(filePath)) {
    return true;
  }
  const stalePath = getStalePath(source, weekKey, cacheDir);
  return fs.existsSync(stalePath);
}

export function invalidateCache(
  source: ActivitySource,
  weekKey: string,
  cacheDir: string = DEFAULT_CACHE_DIR,
): void {
  const stalePath = getStalePath(source, weekKey, cacheDir);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(stalePath, "");
}
