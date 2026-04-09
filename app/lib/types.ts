export type ActivitySource =
  | "github"
  | "slack"
  | "google-calendar"
  | "jira"
  | "claude-code";

export type ActivityType =
  | "commit"
  | "pr-created"
  | "pr-merged"
  | "pr-review"
  | "pr-comment"
  | "meeting"
  | "slack-message"
  | "jira-update"
  | "claude-session";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  source: ActivitySource;
  timestamp: string; // ISO 8601
  title: string;
  description?: string;
  metadata?: Record<string, string | number | boolean | null>;
}
