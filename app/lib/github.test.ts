import { describe, it, expect } from "vitest";
import {
  normalizeCommits,
  normalizePRs,
  normalizeReviewEvents,
  normalizeCommentEvents,
} from "./github";

const commitSearchResponse = {
  total_count: 2,
  items: [
    {
      sha: "abc123def456",
      commit: {
        message: "Fix parser bug in tokenizer",
        author: { date: "2026-04-07T10:30:00Z" },
      },
      repository: { full_name: "acme/frontend" },
      html_url: "https://github.com/acme/frontend/commit/abc123def456",
    },
    {
      sha: "789ghi012jkl",
      commit: {
        message: "Add unit tests for parser\n\nCovers edge cases",
        author: { date: "2026-04-08T14:15:00Z" },
      },
      repository: { full_name: "acme/frontend" },
      html_url: "https://github.com/acme/frontend/commit/789ghi012jkl",
    },
  ],
};

const prCreatedSearchResponse = {
  total_count: 1,
  items: [
    {
      number: 42,
      title: "Add dark mode support",
      state: "open" as const,
      created_at: "2026-04-07T09:00:00Z",
      pull_request: { merged_at: null },
      repository_url: "https://api.github.com/repos/acme/frontend",
      html_url: "https://github.com/acme/frontend/pull/42",
    },
  ],
};

const prMergedSearchResponse = {
  total_count: 1,
  items: [
    {
      number: 38,
      title: "Refactor auth middleware",
      state: "closed" as const,
      created_at: "2026-04-05T11:00:00Z",
      closed_at: "2026-04-08T16:00:00Z",
      pull_request: { merged_at: "2026-04-08T16:00:00Z" },
      repository_url: "https://api.github.com/repos/acme/backend",
      html_url: "https://github.com/acme/backend/pull/38",
    },
  ],
};

const reviewEvents = [
  {
    id: "evt-001",
    type: "PullRequestReviewEvent" as const,
    created_at: "2026-04-07T11:30:00Z",
    repo: { name: "acme/frontend" },
    payload: {
      action: "submitted",
      review: {
        id: 12345,
        state: "approved",
        html_url:
          "https://github.com/acme/frontend/pull/40#pullrequestreview-12345",
        body: "LGTM!",
      },
      pull_request: { number: 40, title: "Update dependencies" },
    },
  },
];

const commentEvents = [
  {
    id: "evt-002",
    type: "PullRequestReviewCommentEvent" as const,
    created_at: "2026-04-09T08:45:00Z",
    repo: { name: "acme/backend" },
    payload: {
      action: "created",
      comment: {
        id: 67890,
        body: "Should we add a test for this edge case?",
        html_url:
          "https://github.com/acme/backend/pull/39#discussion_r67890",
      },
      pull_request: { number: 39, title: "Add caching layer" },
    },
  },
];

describe("normalizeCommits", () => {
  it("converts search results to ActivityItems", () => {
    const items = normalizeCommits(commitSearchResponse);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      id: "github-commit-abc123def456",
      type: "commit",
      source: "github",
      timestamp: "2026-04-07T10:30:00Z",
      title: "Fix parser bug in tokenizer",
      description: "acme/frontend",
      metadata: {
        sha: "abc123def456",
        repo: "acme/frontend",
        url: "https://github.com/acme/frontend/commit/abc123def456",
      },
    });
  });

  it("uses first line of multi-line commit messages", () => {
    const items = normalizeCommits(commitSearchResponse);
    expect(items[1]!.title).toBe("Add unit tests for parser");
  });

  it("returns empty array for zero results", () => {
    const items = normalizeCommits({ total_count: 0, items: [] });
    expect(items).toEqual([]);
  });
});

describe("normalizePRs", () => {
  it("normalizes created PRs", () => {
    const items = normalizePRs(prCreatedSearchResponse, "pr-created");
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      id: "github-pr-created-acme/frontend-42",
      type: "pr-created",
      source: "github",
      timestamp: "2026-04-07T09:00:00Z",
      title: "Add dark mode support",
      description: "acme/frontend#42",
      metadata: {
        number: 42,
        repo: "acme/frontend",
        url: "https://github.com/acme/frontend/pull/42",
      },
    });
  });

  it("normalizes merged PRs with merged_at timestamp", () => {
    const items = normalizePRs(prMergedSearchResponse, "pr-merged");
    expect(items).toHaveLength(1);
    expect(items[0]!.type).toBe("pr-merged");
    expect(items[0]!.timestamp).toBe("2026-04-08T16:00:00Z");
  });

  it("returns empty array for zero results", () => {
    const items = normalizePRs({ total_count: 0, items: [] }, "pr-created");
    expect(items).toEqual([]);
  });
});

describe("normalizeReviewEvents", () => {
  it("converts review events to ActivityItems", () => {
    const items = normalizeReviewEvents(reviewEvents);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      id: "github-pr-review-12345",
      type: "pr-review",
      source: "github",
      timestamp: "2026-04-07T11:30:00Z",
      title: "Reviewed: Update dependencies",
      description: "acme/frontend#40 — approved",
      metadata: {
        reviewId: 12345,
        prNumber: 40,
        repo: "acme/frontend",
        state: "approved",
        url: "https://github.com/acme/frontend/pull/40#pullrequestreview-12345",
      },
    });
  });

  it("returns empty array for empty events", () => {
    expect(normalizeReviewEvents([])).toEqual([]);
  });
});

describe("normalizeCommentEvents", () => {
  it("converts comment events to ActivityItems", () => {
    const items = normalizeCommentEvents(commentEvents);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      id: "github-pr-comment-67890",
      type: "pr-comment",
      source: "github",
      timestamp: "2026-04-09T08:45:00Z",
      title: "Commented on: Add caching layer",
      description: "acme/backend#39",
      metadata: {
        commentId: 67890,
        prNumber: 39,
        repo: "acme/backend",
        url: "https://github.com/acme/backend/pull/39#discussion_r67890",
      },
    });
  });

  it("returns empty array for empty events", () => {
    expect(normalizeCommentEvents([])).toEqual([]);
  });
});
