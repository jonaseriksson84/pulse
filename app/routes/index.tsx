import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  GitCommit,
  GitPullRequest,
  Eye,
  MessageSquare,
  Bot,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { fetchGitHubActivity } from "~/lib/github";
import { readClaudeCodeActivity } from "~/lib/claude-code";
import { readCache, writeCache, isCacheStale, invalidateCache } from "~/lib/cache";
import {
  getWeekBounds,
  formatWeekKey,
  getPreviousWeek,
  getNextWeek,
} from "~/lib/week";
import type { ActivityItem } from "~/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";

// --- Server functions ---

const getGitHubData = createServerFn({ method: "GET" })
  .inputValidator((data: { week?: string }) => data)
  .handler(async ({ data }) => {
    const targetDate = data.week
      ? new Date(data.week + "T12:00:00")
      : new Date();
    const bounds = getWeekBounds(targetDate);
    const weekKey = formatWeekKey(targetDate);

    const token = process.env.GITHUB_TOKEN;
    const username = process.env.GITHUB_USERNAME;

    if (!token || !username) {
      return {
        items: [] as ActivityItem[],
        weekKey,
        weekStart: bounds.start.toISOString(),
        weekEnd: bounds.end.toISOString(),
        configured: false,
      };
    }

    if (!isCacheStale("github", weekKey)) {
      const cached = readCache("github", weekKey);
      if (cached) {
        return {
          items: cached,
          weekKey,
          weekStart: bounds.start.toISOString(),
          weekEnd: bounds.end.toISOString(),
          configured: true,
        };
      }
    }

    try {
      const items = await fetchGitHubActivity(
        username,
        token,
        bounds.start,
        bounds.end,
      );
      writeCache("github", weekKey, items);
      return {
        items,
        weekKey,
        weekStart: bounds.start.toISOString(),
        weekEnd: bounds.end.toISOString(),
        configured: true,
      };
    } catch {
      return {
        items: [] as ActivityItem[],
        weekKey,
        weekStart: bounds.start.toISOString(),
        weekEnd: bounds.end.toISOString(),
        configured: true,
        error: "Failed to fetch GitHub data",
      };
    }
  });

const getClaudeCodeData = createServerFn({ method: "GET" })
  .inputValidator((data: { week?: string }) => data)
  .handler(async ({ data }) => {
    const targetDate = data.week
      ? new Date(data.week + "T12:00:00")
      : new Date();
    const bounds = getWeekBounds(targetDate);
    const weekKey = formatWeekKey(targetDate);

    const historyPath = process.env.CLAUDE_HISTORY_PATH;

    if (!historyPath) {
      return { items: [] as ActivityItem[], configured: false };
    }

    if (!isCacheStale("claude-code", weekKey)) {
      const cached = readCache("claude-code", weekKey);
      if (cached) {
        return { items: cached, configured: true };
      }
    }

    try {
      const items = readClaudeCodeActivity(
        historyPath,
        bounds.start,
        bounds.end,
      );
      writeCache("claude-code", weekKey, items);
      return { items, configured: true };
    } catch {
      return {
        items: [] as ActivityItem[],
        configured: true,
        error: "Failed to read Claude Code history",
      };
    }
  });

const refreshData = createServerFn({ method: "POST" })
  .inputValidator((data: { week: string }) => data)
  .handler(async ({ data }) => {
    invalidateCache("github", data.week);
    invalidateCache("claude-code", data.week);
  });

// --- Route ---

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    week: typeof search.week === "string" ? search.week : undefined,
  }),
  loaderDeps: ({ search }) => ({ week: search.week }),
  loader: async ({ deps }) => {
    const [github, claudeCode] = await Promise.all([
      getGitHubData({ data: { week: deps.week } }),
      getClaudeCodeData({ data: { week: deps.week } }),
    ]);
    return {
      items: [...github.items, ...claudeCode.items],
      weekKey: github.weekKey,
      weekStart: github.weekStart,
      weekEnd: github.weekEnd,
      sources: {
        github: { configured: github.configured, error: "error" in github ? (github.error as string) : undefined },
        claudeCode: { configured: claudeCode.configured, error: "error" in claudeCode ? (claudeCode.error as string) : undefined },
      },
    };
  },
  component: HomePage,
});

// --- Helpers ---

function groupByDay(items: ActivityItem[]): Map<string, ActivityItem[]> {
  const groups = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const day = item.timestamp.split("T")[0]!;
    const existing = groups.get(day) ?? [];
    existing.push(item);
    groups.set(day, existing);
  }
  // Sort items within each day by timestamp descending
  for (const [key, dayItems] of groups) {
    groups.set(
      key,
      dayItems.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    );
  }
  return groups;
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  const startStr = s.toLocaleDateString("en-US", opts);
  const endStr = e.toLocaleDateString("en-US", {
    ...opts,
    year: "numeric",
  });
  return `${startStr} – ${endStr}`;
}

function formatDayHeader(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function getWeekDays(weekStart: string, weekEnd: string): string[] {
  const days: string[] = [];
  const start = new Date(weekStart);
  const end = new Date(weekEnd);
  const current = new Date(start);
  while (current <= end) {
    days.push(current.toISOString().split("T")[0]!);
    current.setDate(current.getDate() + 1);
  }
  return days;
}

const activityIcons: Record<string, typeof GitCommit> = {
  commit: GitCommit,
  "pr-created": GitPullRequest,
  "pr-merged": GitPullRequest,
  "pr-review": Eye,
  "pr-comment": MessageSquare,
  "claude-session": Bot,
};

const activityLabels: Record<string, string> = {
  commit: "Commit",
  "pr-created": "PR opened",
  "pr-merged": "PR merged",
  "pr-review": "Review",
  "pr-comment": "Comment",
  "claude-session": "Claude Code",
};

// --- Components ---

function StatBar({ items }: { items: ActivityItem[] }) {
  const commits = items.filter((i) => i.type === "commit").length;
  const prsMerged = items.filter((i) => i.type === "pr-merged").length;
  const reviews = items.filter((i) => i.type === "pr-review").length;

  const stats = [
    { label: "Commits", value: commits },
    { label: "PRs Merged", value: prsMerged },
    { label: "PR Reviews", value: reviews },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold">{stat.value}</div>
            <div className="text-sm text-muted-foreground">{stat.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const Icon = activityIcons[item.type] ?? GitCommit;
  const label = activityLabels[item.type] ?? item.type;
  const time = new Date(item.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {label}
          </Badge>
          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
        <p className="mt-0.5 text-sm font-medium leading-snug">{item.title}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground">{item.description}</p>
        )}
      </div>
    </div>
  );
}

function DaySection({
  dateStr,
  items,
}: {
  dateStr: string;
  items: ActivityItem[];
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            {formatDayHeader(dateStr)}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>
      {expanded && items.length > 0 && (
        <CardContent className="px-4 pb-4 pt-0">
          <div className="divide-y">
            {items.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
        </CardContent>
      )}
      {expanded && items.length === 0 && (
        <CardContent className="px-4 pb-4 pt-0">
          <p className="text-sm text-muted-foreground">No activity</p>
        </CardContent>
      )}
    </Card>
  );
}

function HomePage() {
  const data = Route.useLoaderData();
  const { week } = Route.useSearch();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const prevWeekKey = formatWeekKey(
    getPreviousWeek(new Date(data.weekStart)).start,
  );
  const nextWeekKey = formatWeekKey(
    getNextWeek(new Date(data.weekStart)).start,
  );

  const isCurrentWeek =
    formatWeekKey(new Date()) === data.weekKey;

  const grouped = groupByDay(data.items);
  const weekDays = getWeekDays(data.weekStart, data.weekEnd);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshData({ data: { week: data.weekKey } });
      await router.invalidate();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      {/* Week header */}
      <div className="mb-6 flex items-center justify-between">
        <Link to="/" search={{ week: prevWeekKey }}>
          <Button variant="ghost" size="icon">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="text-center">
          <h1 className="text-2xl font-bold">Pulse</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateRange(data.weekStart, data.weekEnd)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </Button>
          {!isCurrentWeek && (
            <Link to="/" search={{ week: nextWeekKey }}>
              <Button variant="ghost" size="icon">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Not configured warnings */}
      {!data.sources.github.configured && (
        <Card className="mb-6 border-destructive">
          <CardContent className="p-4 text-sm">
            GitHub is not configured. Set <code>GITHUB_TOKEN</code> and{" "}
            <code>GITHUB_USERNAME</code> in your <code>.env</code> file.
          </CardContent>
        </Card>
      )}
      {!data.sources.claudeCode.configured && (
        <Card className="mb-6 border-destructive">
          <CardContent className="p-4 text-sm">
            Claude Code is not configured. Set{" "}
            <code>CLAUDE_HISTORY_PATH</code> in your <code>.env</code> file
            (e.g. <code>~/.claude/projects</code>).
          </CardContent>
        </Card>
      )}

      {/* Errors */}
      {data.sources.github.error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="p-4 text-sm text-destructive">
            {data.sources.github.error}
          </CardContent>
        </Card>
      )}
      {data.sources.claudeCode.error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="p-4 text-sm text-destructive">
            {data.sources.claudeCode.error}
          </CardContent>
        </Card>
      )}

      {/* Stat bar */}
      <div className="mb-6">
        <StatBar items={data.items} />
      </div>

      {/* Day timeline */}
      <div className="space-y-4">
        {weekDays.map((day) => (
          <DaySection
            key={day}
            dateStr={day}
            items={grouped.get(day) ?? []}
          />
        ))}
      </div>
    </main>
  );
}
