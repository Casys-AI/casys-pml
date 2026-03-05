/** Parse a template reference like "NoteName.output" into parts */
export function parseRef(ref: string): { note: string; output: string } {
  const parts = ref.trim().split(".");
  if (parts.length === 1) return { note: parts[0], output: "output" };
  return { note: parts[0], output: parts.slice(1).join(".") };
}
