import { describe, it, expect } from "vitest";
import {
  normalizeIssues,
  normalizeTransitions,
  normalizeComments,
} from "./jira";

const issuesResponse = {
  issues: [
    {
      key: "PROJ-101",
      fields: {
        summary: "Add pagination to the search results",
        updated: "2026-04-07T15:30:00.000+0000",
        status: { name: "In Progress" },
      },
      self: "https://acme.atlassian.net/rest/api/3/issue/10101",
    },
    {
      key: "PROJ-102",
      fields: {
        summary: "Fix broken CSV export",
        updated: "2026-04-08T11:00:00.000+0000",
        status: { name: "Done" },
      },
      self: "https://acme.atlassian.net/rest/api/3/issue/10102",
    },
  ],
};

const transitionsResponse = {
  values: [
    {
      id: "501",
      created: "2026-04-07T14:00:00.000+0000",
      items: [
        {
          field: "status",
          fromString: "To Do",
          toString: "In Progress",
        },
      ],
      author: { accountId: "user-123" },
    },
    {
      id: "502",
      created: "2026-04-08T10:30:00.000+0000",
      items: [
        {
          field: "status",
          fromString: "In Progress",
          toString: "Done",
        },
      ],
      author: { accountId: "user-123" },
    },
    {
      id: "503",
      created: "2026-04-08T10:35:00.000+0000",
      items: [
        {
          field: "priority",
          fromString: "Medium",
          toString: "High",
        },
      ],
      author: { accountId: "user-123" },
    },
  ],
};

const commentsResponse = {
  comments: [
    {
      id: "601",
      created: "2026-04-07T16:00:00.000+0000",
      author: { accountId: "user-123" },
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Looks good, deploying now" }],
          },
        ],
      },
    },
    {
      id: "602",
      created: "2026-04-09T09:00:00.000+0000",
      author: { accountId: "other-user" },
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Someone else's comment" }],
          },
        ],
      },
    },
  ],
};

describe("normalizeIssues", () => {
  it("converts Jira issues to ActivityItems", () => {
    const items = normalizeIssues(
      issuesResponse,
      "https://acme.atlassian.net",
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      id: "jira-update-PROJ-101",
      type: "jira-update",
      source: "jira",
      timestamp: "2026-04-07T15:30:00.000+0000",
      title: "PROJ-101: Add pagination to the search results",
      description: "Status: In Progress",
      metadata: {
        key: "PROJ-101",
        status: "In Progress",
        url: "https://acme.atlassian.net/browse/PROJ-101",
      },
    });
  });

  it("returns empty array for no issues", () => {
    expect(normalizeIssues({ issues: [] }, "https://acme.atlassian.net")).toEqual([]);
  });
});

describe("normalizeTransitions", () => {
  it("converts status transitions to ActivityItems", () => {
    const items = normalizeTransitions(
      transitionsResponse,
      "PROJ-101",
      "Add pagination to the search results",
      "user-123",
      "https://acme.atlassian.net",
    );
    // Should only include status field changes by matching user
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      id: "jira-transition-PROJ-101-501",
      type: "jira-update",
      source: "jira",
      timestamp: "2026-04-07T14:00:00.000+0000",
      title: "PROJ-101: To Do → In Progress",
      description: "Add pagination to the search results",
      metadata: {
        key: "PROJ-101",
        from: "To Do",
        to: "In Progress",
        url: "https://acme.atlassian.net/browse/PROJ-101",
      },
    });
  });

  it("filters out non-status transitions", () => {
    const items = normalizeTransitions(
      transitionsResponse,
      "PROJ-101",
      "summary",
      "user-123",
      "https://acme.atlassian.net",
    );
    // id 503 has field "priority", not "status" → filtered out
    expect(items).toHaveLength(2);
  });

  it("filters out transitions by other users", () => {
    const items = normalizeTransitions(
      transitionsResponse,
      "PROJ-101",
      "summary",
      "different-user",
      "https://acme.atlassian.net",
    );
    expect(items).toHaveLength(0);
  });

  it("returns empty for no transitions", () => {
    expect(
      normalizeTransitions(
        { values: [] },
        "PROJ-101",
        "summary",
        "user-123",
        "https://acme.atlassian.net",
      ),
    ).toEqual([]);
  });
});

describe("normalizeComments", () => {
  it("converts user comments to ActivityItems", () => {
    const items = normalizeComments(
      commentsResponse,
      "PROJ-101",
      "Add pagination to the search results",
      "user-123",
      "https://acme.atlassian.net",
    );
    // Only includes comments by matching user
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      id: "jira-comment-PROJ-101-601",
      type: "jira-update",
      source: "jira",
      timestamp: "2026-04-07T16:00:00.000+0000",
      title: "PROJ-101: Commented",
      description: "Add pagination to the search results",
      metadata: {
        key: "PROJ-101",
        commentId: "601",
        url: "https://acme.atlassian.net/browse/PROJ-101",
      },
    });
  });

  it("filters out comments by other users", () => {
    const items = normalizeComments(
      commentsResponse,
      "PROJ-101",
      "summary",
      "other-user",
      "https://acme.atlassian.net",
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.metadata!.commentId).toBe("602");
  });

  it("returns empty for no comments", () => {
    expect(
      normalizeComments(
        { comments: [] },
        "PROJ-101",
        "summary",
        "user-123",
        "https://acme.atlassian.net",
      ),
    ).toEqual([]);
  });
});
