export interface OpenClawFixtureOptions {
  sessionId?: string;
  assistantText?: string;
  bom?: boolean;
  lineEnding?: "lf" | "crlf";
  truncated?: boolean;
  empty?: boolean;
}

export function buildOpenClawFixture(
  options: OpenClawFixtureOptions = {},
): string {
  if (options.empty) return "";

  const sessionId = options.sessionId ?? "abcd1234-0000";
  const assistantText = options.assistantText ?? "done";
  const lineEnding = options.lineEnding === "crlf" ? "\r\n" : "\n";
  const lines = [
    JSON.stringify({
      type: "session",
      id: sessionId,
      timestamp: "2026-03-06T12:00:00.000Z",
    }),
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-06T12:00:01.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "status" }],
      },
    }),
    JSON.stringify({
      type: "message",
      timestamp: "2026-03-06T12:00:02.000Z",
      message: {
        role: "assistant",
        content: [{ type: "text", text: assistantText }],
      },
    }),
  ];

  const prefix = options.bom ? "\uFEFF" : "";
  const serialized = `${prefix}${lines.join(lineEnding)}${lineEnding}`;
  if (!options.truncated) return serialized;
  return serialized.slice(0, -2);
}
