import * as fs from "node:fs";
import * as path from "node:path";
import type { ActivityItem } from "./types";

// --- JSONL entry types (only fields we use) ---

interface ConversationEntry {
  type: string;
  timestamp: string;
  sessionId?: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
  };
}

export interface SessionInfo {
  sessionId: string;
  timestamp: string;
  title: string;
  project: string;
}

// --- Title extraction ---

export function extractTitle(
  content: string | Array<{ type: string; text?: string }>,
): string {
  let text: string;
  if (typeof content === "string") {
    text = content;
  } else {
    const textBlock = content.find((b) => b.type === "text" && b.text);
    text = textBlock?.text ?? "";
  }

  const firstLine =
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";

  const cleaned = firstLine.replace(/^#+\s*/, "");

  if (cleaned.length <= 80) return cleaned;

  const truncated = cleaned.substring(0, 80);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 40 ? truncated.substring(0, lastSpace) : truncated) + "…";
}

// --- File parsing ---

export function parseConversationFile(
  filePath: string,
  weekStart: Date,
  weekEnd: Date,
): SessionInfo | null {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  if (lines.length === 0) return null;

  let firstEntry: ConversationEntry;
  try {
    firstEntry = JSON.parse(lines[0]!) as ConversationEntry;
  } catch {
    return null;
  }

  const timestamp = firstEntry.timestamp;
  if (!timestamp) return null;

  const sessionDate = new Date(timestamp);
  if (sessionDate < weekStart || sessionDate > weekEnd) return null;

  const sessionId = path.basename(filePath, ".jsonl");
  const projectDir = path.basename(path.dirname(filePath));
  const project = projectDir.replace(/^-/, "").replace(/-/g, "/");

  let title = "Claude Code session";
  for (const line of lines.slice(0, 20)) {
    try {
      const entry = JSON.parse(line) as ConversationEntry;
      if (
        entry.type === "user" &&
        entry.message?.role === "user" &&
        entry.message.content
      ) {
        title = extractTitle(entry.message.content);
        break;
      }
    } catch {
      continue;
    }
  }

  return { sessionId, timestamp, title, project };
}

// --- Normalization ---

export function normalizeSessions(sessions: SessionInfo[]): ActivityItem[] {
  return sessions.map((session) => ({
    id: `claude-session-${session.sessionId}`,
    type: "claude-session" as const,
    source: "claude-code" as const,
    timestamp: session.timestamp,
    title: session.title,
    description: session.project,
    metadata: {
      sessionId: session.sessionId,
      project: session.project,
    },
  }));
}

// --- Directory scanner ---

export function readClaudeCodeActivity(
  historyPath: string,
  weekStart: Date,
  weekEnd: Date,
): ActivityItem[] {
  if (!fs.existsSync(historyPath)) return [];

  const sessions: SessionInfo[] = [];

  const entries = fs.readdirSync(historyPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const projectDir = path.join(historyPath, entry.name);
    const files = fs.readdirSync(projectDir, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;

      const filePath = path.join(projectDir, file.name);
      const session = parseConversationFile(filePath, weekStart, weekEnd);
      if (session) {
        sessions.push(session);
      }
    }
  }

  return normalizeSessions(sessions);
}
