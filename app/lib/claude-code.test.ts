import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  extractTitle,
  parseConversationFile,
  normalizeSessions,
  readClaudeCodeActivity,
} from "./claude-code";

const TEST_DIR = path.join(process.cwd(), ".test-claude-history");

function writeJsonl(filePath: string, entries: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, entries.map((e) => JSON.stringify(e)).join("\n"));
}

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

// --- Fixture data ---

const sessionA = [
  {
    type: "queue-operation",
    operation: "enqueue",
    timestamp: "2026-04-07T10:00:00Z",
    sessionId: "aaaa-1111",
    content: "Fix the login bug",
  },
  {
    type: "queue-operation",
    operation: "dequeue",
    timestamp: "2026-04-07T10:00:00Z",
    sessionId: "aaaa-1111",
  },
  {
    type: "user",
    timestamp: "2026-04-07T10:00:01Z",
    sessionId: "aaaa-1111",
    parentUuid: null,
    isSidechain: false,
    message: {
      role: "user",
      content: "Fix the login bug in the auth middleware",
    },
  },
  {
    type: "assistant",
    timestamp: "2026-04-07T10:00:15Z",
    sessionId: "aaaa-1111",
    parentUuid: "abc",
    isSidechain: false,
    message: {
      role: "assistant",
      content: [{ type: "text", text: "I'll fix the login bug." }],
    },
  },
];

const sessionB = [
  {
    type: "queue-operation",
    operation: "enqueue",
    timestamp: "2026-04-09T14:30:00Z",
    sessionId: "bbbb-2222",
    content: "Refactor the cache module",
  },
  {
    type: "user",
    timestamp: "2026-04-09T14:30:01Z",
    sessionId: "bbbb-2222",
    parentUuid: null,
    isSidechain: false,
    message: {
      role: "user",
      content: [
        { type: "text", text: "Refactor the cache module to support TTL" },
      ],
    },
  },
];

const sessionOutOfRange = [
  {
    type: "queue-operation",
    operation: "enqueue",
    timestamp: "2026-03-28T09:00:00Z",
    sessionId: "cccc-3333",
  },
  {
    type: "user",
    timestamp: "2026-03-28T09:00:01Z",
    sessionId: "cccc-3333",
    parentUuid: null,
    isSidechain: false,
    message: { role: "user", content: "Old session from last month" },
  },
];

const weekStart = new Date("2026-04-06T00:00:00.000Z");
const weekEnd = new Date("2026-04-12T23:59:59.999Z");

// --- Tests ---

describe("extractTitle", () => {
  it("extracts title from a plain string", () => {
    expect(extractTitle("Fix the login bug")).toBe("Fix the login bug");
  });

  it("extracts first line from multiline string", () => {
    expect(extractTitle("First line\nSecond line\nThird line")).toBe(
      "First line",
    );
  });

  it("strips markdown heading prefix", () => {
    expect(extractTitle("# Context\n\nSome details")).toBe("Context");
  });

  it("strips multiple heading levels", () => {
    expect(extractTitle("### My Heading")).toBe("My Heading");
  });

  it("truncates long titles at word boundary", () => {
    const long =
      "This is a very long title that should be truncated because it exceeds the maximum allowed character count for display";
    const result = extractTitle(long);
    expect(result.length).toBeLessThanOrEqual(81); // 80 + ellipsis
    expect(result).toContain("…");
  });

  it("extracts from content block array", () => {
    const content = [
      { type: "text", text: "Help me debug the tests" },
      { type: "tool_use", text: undefined },
    ];
    expect(extractTitle(content)).toBe("Help me debug the tests");
  });

  it("returns empty string for empty content array", () => {
    expect(extractTitle([])).toBe("");
  });

  it("skips empty lines", () => {
    expect(extractTitle("\n\n  \nActual content")).toBe("Actual content");
  });
});

describe("parseConversationFile", () => {
  it("parses a valid conversation file within range", () => {
    const filePath = path.join(TEST_DIR, "my-project", "aaaa-1111.jsonl");
    writeJsonl(filePath, sessionA);

    const result = parseConversationFile(filePath, weekStart, weekEnd);
    expect(result).toEqual({
      sessionId: "aaaa-1111",
      timestamp: "2026-04-07T10:00:00Z",
      title: "Fix the login bug in the auth middleware",
      project: "my/project",
    });
  });

  it("returns null for session outside week range", () => {
    const filePath = path.join(TEST_DIR, "my-project", "cccc-3333.jsonl");
    writeJsonl(filePath, sessionOutOfRange);

    const result = parseConversationFile(filePath, weekStart, weekEnd);
    expect(result).toBeNull();
  });

  it("returns null for empty file", () => {
    const filePath = path.join(TEST_DIR, "my-project", "empty.jsonl");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "");

    const result = parseConversationFile(filePath, weekStart, weekEnd);
    expect(result).toBeNull();
  });

  it("handles content block arrays in user messages", () => {
    const filePath = path.join(TEST_DIR, "my-project", "bbbb-2222.jsonl");
    writeJsonl(filePath, sessionB);

    const result = parseConversationFile(filePath, weekStart, weekEnd);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Refactor the cache module to support TTL");
  });

  it("falls back to default title when no user message found", () => {
    const entries = [
      {
        type: "queue-operation",
        operation: "enqueue",
        timestamp: "2026-04-08T08:00:00Z",
        sessionId: "dddd-4444",
      },
    ];
    const filePath = path.join(TEST_DIR, "my-project", "dddd-4444.jsonl");
    writeJsonl(filePath, entries);

    const result = parseConversationFile(filePath, weekStart, weekEnd);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Claude Code session");
  });
});

describe("normalizeSessions", () => {
  it("converts sessions to ActivityItems", () => {
    const sessions = [
      {
        sessionId: "aaaa-1111",
        timestamp: "2026-04-07T10:00:00Z",
        title: "Fix the login bug",
        project: "my/project",
      },
    ];

    const items = normalizeSessions(sessions);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      id: "claude-session-aaaa-1111",
      type: "claude-session",
      source: "claude-code",
      timestamp: "2026-04-07T10:00:00Z",
      title: "Fix the login bug",
      description: "my/project",
      metadata: {
        sessionId: "aaaa-1111",
        project: "my/project",
      },
    });
  });

  it("returns empty array for no sessions", () => {
    expect(normalizeSessions([])).toEqual([]);
  });
});

describe("readClaudeCodeActivity", () => {
  it("scans project directories and returns matching sessions", () => {
    const projectDir = path.join(TEST_DIR, "-home-user-myproject");
    writeJsonl(path.join(projectDir, "aaaa-1111.jsonl"), sessionA);
    writeJsonl(path.join(projectDir, "bbbb-2222.jsonl"), sessionB);
    writeJsonl(path.join(projectDir, "cccc-3333.jsonl"), sessionOutOfRange);

    const items = readClaudeCodeActivity(TEST_DIR, weekStart, weekEnd);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id).sort()).toEqual([
      "claude-session-aaaa-1111",
      "claude-session-bbbb-2222",
    ]);
  });

  it("skips subagent JSONL files in session subdirectories", () => {
    const projectDir = path.join(TEST_DIR, "-home-user-myproject");
    writeJsonl(path.join(projectDir, "aaaa-1111.jsonl"), sessionA);
    // Subagent file should be ignored (it's in a subdirectory, not top-level)
    writeJsonl(
      path.join(projectDir, "aaaa-1111", "subagents", "agent-xyz.jsonl"),
      sessionB,
    );

    const items = readClaudeCodeActivity(TEST_DIR, weekStart, weekEnd);
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("claude-session-aaaa-1111");
  });

  it("returns empty array for non-existent path", () => {
    const items = readClaudeCodeActivity("/tmp/nonexistent-path", weekStart, weekEnd);
    expect(items).toEqual([]);
  });

  it("returns empty array for empty directory", () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const items = readClaudeCodeActivity(TEST_DIR, weekStart, weekEnd);
    expect(items).toEqual([]);
  });

  it("scans multiple project directories", () => {
    writeJsonl(
      path.join(TEST_DIR, "project-a", "aaaa-1111.jsonl"),
      sessionA,
    );
    writeJsonl(
      path.join(TEST_DIR, "project-b", "bbbb-2222.jsonl"),
      sessionB,
    );

    const items = readClaudeCodeActivity(TEST_DIR, weekStart, weekEnd);
    expect(items).toHaveLength(2);
  });
});
