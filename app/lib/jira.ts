import type { ActivityItem } from "./types";

// --- Jira API response types (only fields we use) ---

interface JiraIssueSearchResult {
  issues: Array<{
    key: string;
    fields: {
      summary: string;
      updated: string;
      status: { name: string };
    };
    self: string;
  }>;
}

interface JiraChangelogResult {
  values: Array<{
    id: string;
    created: string;
    items: Array<{
      field: string;
      fromString: string;
      toString: string;
    }>;
    author: { accountId: string };
  }>;
}

interface JiraCommentsResult {
  comments: Array<{
    id: string;
    created: string;
    author: { accountId: string };
    body: unknown;
  }>;
}

// --- Normalizers ---

export function normalizeIssues(
  searchResult: JiraIssueSearchResult,
  baseUrl: string,
): ActivityItem[] {
  return searchResult.issues.map((issue) => ({
    id: `jira-update-${issue.key}`,
    type: "jira-update" as const,
    source: "jira" as const,
    timestamp: issue.fields.updated,
    title: `${issue.key}: ${issue.fields.summary}`,
    description: `Status: ${issue.fields.status.name}`,
    metadata: {
      key: issue.key,
      status: issue.fields.status.name,
      url: `${baseUrl}/browse/${issue.key}`,
    },
  }));
}

export function normalizeTransitions(
  changelog: JiraChangelogResult,
  issueKey: string,
  issueSummary: string,
  accountId: string,
  baseUrl: string,
): ActivityItem[] {
  return changelog.values
    .filter(
      (entry) =>
        entry.author.accountId === accountId &&
        entry.items.some((item) => item.field === "status"),
    )
    .map((entry) => {
      const statusChange = entry.items.find((item) => item.field === "status")!;
      return {
        id: `jira-transition-${issueKey}-${entry.id}`,
        type: "jira-update" as const,
        source: "jira" as const,
        timestamp: entry.created,
        title: `${issueKey}: ${statusChange.fromString} → ${statusChange.toString}`,
        description: issueSummary,
        metadata: {
          key: issueKey,
          from: statusChange.fromString,
          to: statusChange.toString,
          url: `${baseUrl}/browse/${issueKey}`,
        },
      };
    });
}

export function normalizeComments(
  commentsResult: JiraCommentsResult,
  issueKey: string,
  issueSummary: string,
  accountId: string,
  baseUrl: string,
): ActivityItem[] {
  return commentsResult.comments
    .filter((comment) => comment.author.accountId === accountId)
    .map((comment) => ({
      id: `jira-comment-${issueKey}-${comment.id}`,
      type: "jira-update" as const,
      source: "jira" as const,
      timestamp: comment.created,
      title: `${issueKey}: Commented`,
      description: issueSummary,
      metadata: {
        key: issueKey,
        commentId: comment.id,
        url: `${baseUrl}/browse/${issueKey}`,
      },
    }));
}

// --- Fetcher ---

async function jiraFetch(
  url: string,
  email: string,
  token: string,
): Promise<unknown> {
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Jira API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export async function fetchJiraActivity(
  baseUrl: string,
  email: string,
  token: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<ActivityItem[]> {
  // Get current user's account ID
  const myself = (await jiraFetch(
    `${baseUrl}/rest/api/3/myself`,
    email,
    token,
  )) as { accountId: string };
  const accountId = myself.accountId;

  // Search for issues updated by user during the week
  const jql = `updated >= "${formatDate(weekStart)}" AND updated <= "${formatDate(weekEnd)}" AND assignee = currentUser() ORDER BY updated DESC`;
  const searchResult = (await jiraFetch(
    `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,updated,status&maxResults=100`,
    email,
    token,
  )) as JiraIssueSearchResult;

  const issueItems = normalizeIssues(searchResult, baseUrl);

  // For each issue, fetch changelog and comments in parallel
  const detailResults = await Promise.all(
    searchResult.issues.map(async (issue) => {
      const [changelog, comments] = await Promise.all([
        jiraFetch(
          `${baseUrl}/rest/api/3/issue/${issue.key}/changelog?maxResults=100`,
          email,
          token,
        ) as Promise<JiraChangelogResult>,
        jiraFetch(
          `${baseUrl}/rest/api/3/issue/${issue.key}/comment?maxResults=100`,
          email,
          token,
        ) as Promise<JiraCommentsResult>,
      ]);

      const transitions = normalizeTransitions(
        changelog,
        issue.key,
        issue.fields.summary,
        accountId,
        baseUrl,
      );
      const commentItems = normalizeComments(
        comments,
        issue.key,
        issue.fields.summary,
        accountId,
        baseUrl,
      );

      return [...transitions, ...commentItems];
    }),
  );

  // Combine issue updates with transitions and comments, deduplicate by ID
  const allItems = [...issueItems, ...detailResults.flat()];
  const seen = new Set<string>();
  return allItems.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
