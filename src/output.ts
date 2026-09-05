export type OutputRecord = Record<string, unknown>;

export function compact(record: OutputRecord): OutputRecord {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

export function truncate(value: unknown, limit: number): { text: string; truncated: boolean } {
  const text = typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value);
  if (text.length <= limit) return { text, truncated: false };
  return { text: `${text.slice(0, limit)}... (truncated, ${text.length} chars total)`, truncated: true };
}

export function microsecondsToIso(value: unknown): string | undefined {
  const numeric = numericValue(value);
  if (numeric === undefined) return undefined;
  const milliseconds = numeric > 10_000_000_000_000_000 ? numeric / 1_000_000 : numeric / 1_000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function numericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}
