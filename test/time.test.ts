import { describe, expect, it } from "vitest";
import { parseDuration, parseTimestamp, resolveTimeRange } from "../src/time.js";

describe("time parsing", () => {
  it("parses agent-friendly durations", () => {
    expect(parseDuration("15m")).toBe(900_000);
    expect(parseDuration("2h")).toBe(7_200_000);
    expect(() => parseDuration("yesterday")).toThrow("Invalid duration");
  });

  it("accepts ISO and Unix timestamp precisions", () => {
    expect(parseTimestamp("2026-09-05T00:00:00Z")).toBe(1_788_566_400_000_000);
    expect(parseTimestamp("1788566400")).toBe(1_788_566_400_000_000);
    expect(parseTimestamp("1788566400000")).toBe(1_788_566_400_000_000);
    expect(parseTimestamp("1788566400000000")).toBe(1_788_566_400_000_000);
  });

  it("builds a default lookback and rejects conflicting range flags", () => {
    const range = resolveTimeRange({ flags: {}, positionals: [] }, { now: 1_788_566_400_000 });
    expect(range.endTime - range.startTime).toBe(15 * 60 * 1_000_000);
    expect(() => resolveTimeRange({ flags: { "--since": "1h", "--start": "2026-09-05T00:00:00Z" }, positionals: [] })).toThrow("Use only one");
  });
});
