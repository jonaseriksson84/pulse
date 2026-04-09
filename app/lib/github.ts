import type { ActivityItem } from "./types";

// --- GitHub API response types (only fields we use) ---

interface GitHubCommitSearchResult {
  total_count: number;
  items: Array<{
    sha: string;
    commit: {
      message: string;
      author: { date: string };
    };
    repository: { full_name: string };
    html_url: string;
  }>;
}

interface GitHubIssueSearchResult {
  total_count: number;
  items: Array<{
    number: number;
    title: string;
    state: string;
    created_at: string;
    closed_at?: string;
    pull_request?: { merged_at: string | null };
    repository_url: string;
    html_url: string;
  }>;
}

interface GitHubReviewEvent {
  id: string;
  type: "PullRequestReviewEvent";
  created_at: string;
  repo: { name: string };
  payload: {
    action: string;
    review: {
      id: number;
      state: string;
      html_url: string;
      body: string;
    };
    pull_request: { number: number; title: string };
  };
}

interface GitHubCommentEvent {
  id: string;
  type: "PullRequestReviewCommentEvent";
  created_at: string;
  repo: { name: string };
  payload: {
    action: string;
    comment: {
      id: number;
      body: string;
      html_url: string;
    };
    pull_request: { number: number; title: string };
  };
}

// --- Normalizers ---

export function normalizeCommits(
  searchResult: GitHubCommitSearchResult,
): ActivityItem[] {
  return searchResult.items.map((item) => ({
    id: `github-commit-${item.sha}`,
    type: "commit",
    source: "github",
    timestamp: item.commit.author.date,
    title: item.commit.message.split("\n")[0]!,
    description: item.repository.full_name,
    metadata: {
      sha: item.sha,
      repo: item.repository.full_name,
      url: item.html_url,
    },
  }));
}

function repoFromUrl(repositoryUrl: string): string {
  // "https://api.github.com/repos/acme/frontend" → "acme/frontend"
  const parts = repositoryUrl.split("/repos/");
  return parts[1] ?? repositoryUrl;
}

export function normalizePRs(
  searchResult: GitHubIssueSearchResult,
  type: "pr-created" | "pr-merged",
): ActivityItem[] {
  return searchResult.items.map((item) => {
    const repo = repoFromUrl(item.repository_url);
    const timestamp =
      type === "pr-merged" && item.pull_request?.merged_at
        ? item.pull_request.merged_at
        : item.created_at;
    return {
      id: `github-${type}-${repo}-${item.number}`,
      type,
      source: "github" as const,
      timestamp,
      title: item.title,
      description: `${repo}#${item.number}`,
      metadata: {
        number: item.number,
        repo,
        url: item.html_url,
      },
    };
  });
}

export function normalizeReviewEvents(
  events: GitHubReviewEvent[],
): ActivityItem[] {
  return events.map((event) => ({
    id: `github-pr-review-${event.payload.review.id}`,
    type: "pr-review",
    source: "github",
    timestamp: event.created_at,
    title: `Reviewed: ${event.payload.pull_request.title}`,
    description: `${event.repo.name}#${event.payload.pull_request.number} — ${event.payload.review.state}`,
    metadata: {
      reviewId: event.payload.review.id,
      prNumber: event.payload.pull_request.number,
      repo: event.repo.name,
      state: event.payload.review.state,
      url: event.payload.review.html_url,
    },
  }));
}

export function normalizeCommentEvents(
  events: GitHubCommentEvent[],
): ActivityItem[] {
  return events.map((event) => ({
    id: `github-pr-comment-${event.payload.comment.id}`,
    type: "pr-comment",
    source: "github",
    timestamp: event.created_at,
    title: `Commented on: ${event.payload.pull_request.title}`,
    description: `${event.repo.name}#${event.payload.pull_request.number}`,
    metadata: {
      commentId: event.payload.comment.id,
      prNumber: event.payload.pull_request.number,
      repo: event.repo.name,
      url: event.payload.comment.html_url,
    },
  }));
}

// --- Fetcher ---

async function githubFetch(
  url: string,
  token: string,
  accept?: string,
): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

async function fetchCommits(
  username: string,
  token: string,
  start: Date,
  end: Date,
): Promise<ActivityItem[]> {
  const q = `author:${username}+author-date:${formatDate(start)}..${formatDate(end)}`;
  const data = (await githubFetch(
    `https://api.github.com/search/commits?q=${q}&per_page=100&sort=author-date&order=desc`,
    token,
  )) as GitHubCommitSearchResult;
  return normalizeCommits(data);
}

async function fetchPRs(
  username: string,
  token: string,
  start: Date,
  end: Date,
  kind: "created" | "merged",
): Promise<ActivityItem[]> {
  const dateQualifier =
    kind === "created"
      ? `created:${formatDate(start)}..${formatDate(end)}`
      : `merged:${formatDate(start)}..${formatDate(end)}`;
  const q = `type:pr+author:${username}+${dateQualifier}`;
  const data = (await githubFetch(
    `https://api.github.com/search/issues?q=${q}&per_page=100&sort=updated&order=desc`,
    token,
  )) as GitHubIssueSearchResult;
  return normalizePRs(data, kind === "created" ? "pr-created" : "pr-merged");
}

async function fetchEvents(
  username: string,
  token: string,
  start: Date,
  end: Date,
): Promise<{ reviews: ActivityItem[]; comments: ActivityItem[] }> {
  const reviews: GitHubReviewEvent[] = [];
  const comments: GitHubCommentEvent[] = [];

  for (let page = 1; page <= 10; page++) {
    const events = (await githubFetch(
      `https://api.github.com/users/${username}/events?per_page=100&page=${page}`,
      token,
    )) as Array<{ type: string; created_at: string; [key: string]: unknown }>;

    if (events.length === 0) break;

    for (const event of events) {
      const eventDate = new Date(event.created_at);
      if (eventDate < start) return { reviews: normalizeReviewEvents(reviews), comments: normalizeCommentEvents(comments) };
      if (eventDate > end) continue;

      if (event.type === "PullRequestReviewEvent") {
        reviews.push(event as unknown as GitHubReviewEvent);
      } else if (event.type === "PullRequestReviewCommentEvent") {
        comments.push(event as unknown as GitHubCommentEvent);
      }
    }
  }

  return {
    reviews: normalizeReviewEvents(reviews),
    comments: normalizeCommentEvents(comments),
  };
}

export async function fetchGitHubActivity(
  username: string,
  token: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<ActivityItem[]> {
  const [commits, prsCreated, prsMerged, { reviews, comments }] =
    await Promise.all([
      fetchCommits(username, token, weekStart, weekEnd),
      fetchPRs(username, token, weekStart, weekEnd, "created"),
      fetchPRs(username, token, weekStart, weekEnd, "merged"),
      fetchEvents(username, token, weekStart, weekEnd),
    ]);

  return [...commits, ...prsCreated, ...prsMerged, ...reviews, ...comments];
}
