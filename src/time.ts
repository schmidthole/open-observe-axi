import { AxiError } from "axi-sdk-js";
import { stringFlag, type FlagDefinition, type ParsedArgs } from "./args.js";

const DURATION_PATTERN = /^(\d+(?:\.\d+)?)(s|m|h|d|w)$/;
const UNIT_MS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

export const TIME_FLAGS: Record<string, FlagDefinition> = {
  "--since": { type: "string", description: "Look back by duration such as 15m, 2h, or 7d (default 15m)" },
  "--start": { type: "string", description: "Range start as ISO-8601 or Unix seconds/milliseconds/microseconds" },
  "--end": { type: "string", description: "Range end as ISO-8601 or Unix seconds/milliseconds/microseconds (default now)" },
};

export interface TimeRange {
  startTime: number;
  endTime: number;
  start: string;
  end: string;
}

export function parseDuration(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) throw new AxiError(`Invalid duration: ${value}`, "VALIDATION_ERROR", ["Use a duration such as 15m, 2h, or 7d"]);
  const amount = Number(match[1]);
  const multiplier = UNIT_MS[match[2] ?? ""];
  if (!Number.isFinite(amount) || amount <= 0 || multiplier === undefined) {
    throw new AxiError(`Invalid duration: ${value}`, "VALIDATION_ERROR");
  }
  return amount * multiplier;
}

export function parseTimestamp(value: string): number {
  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric) || numeric <= 0) {
      throw new AxiError(`Invalid timestamp: ${value}`, "VALIDATION_ERROR");
    }
    if (value.length <= 10) return numeric * 1_000_000;
    if (value.length <= 13) return numeric * 1_000;
    if (value.length <= 16) return numeric;
    throw new AxiError(`Invalid timestamp precision: ${value}`, "VALIDATION_ERROR", ["Use Unix seconds, milliseconds, or microseconds"]);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new AxiError(`Invalid timestamp: ${value}`, "VALIDATION_ERROR", ["Use ISO-8601 or a Unix timestamp"]);
  return milliseconds * 1_000;
}

export function resolveTimeRange(parsed: ParsedArgs, options: { defaultSince?: string; now?: number } = {}): TimeRange {
  const since = stringFlag(parsed, "--since");
  const start = stringFlag(parsed, "--start");
  const end = stringFlag(parsed, "--end");
  if (since && start) throw new AxiError("Use only one of --since or --start", "VALIDATION_ERROR");

  const nowMs = options.now ?? Date.now();
  const endTime = end ? parseTimestamp(end) : nowMs * 1_000;
  const startTime = start
    ? parseTimestamp(start)
    : endTime - parseDuration(since ?? options.defaultSince ?? "15m") * 1_000;
  if (startTime >= endTime) throw new AxiError("Time range start must be before end", "VALIDATION_ERROR");
  return {
    startTime,
    endTime,
    start: new Date(Math.floor(startTime / 1_000)).toISOString(),
    end: new Date(Math.floor(endTime / 1_000)).toISOString(),
  };
}
