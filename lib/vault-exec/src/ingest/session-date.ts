export const DETERMINISTIC_FALLBACK_SESSION_DATE = "1970-01-01";

export function resolveSessionDate(iso?: string): string {
  if (typeof iso === "string") {
    const candidate = iso.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
      return candidate;
    }
  }
  return DETERMINISTIC_FALLBACK_SESSION_DATE;
}
