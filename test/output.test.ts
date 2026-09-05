import { describe, expect, it } from "vitest";
import { microsecondsToIso, truncate } from "../src/output.js";

describe("output helpers", () => {
  it("truncates content with the original size", () => {
    expect(truncate("abcdef", 3)).toEqual({ text: "abc... (truncated, 6 chars total)", truncated: true });
    expect(truncate("abc", 3)).toEqual({ text: "abc", truncated: false });
  });

  it("formats microsecond and nanosecond timestamps", () => {
    expect(microsecondsToIso(1_788_566_400_000_000)).toBe("2026-09-05T00:00:00.000Z");
    expect(microsecondsToIso(1_788_566_400_000_000_000)).toBe("2026-09-05T00:00:00.000Z");
  });
});
