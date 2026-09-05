import { describe, expect, it, vi } from "vitest";
import type { OpenObserveClient } from "../src/client.js";
import { logsCommand } from "../src/commands/logs.js";
import { streamsCommand } from "../src/commands/streams.js";
import { tracesCommand } from "../src/commands/traces.js";

function fakeClient(overrides: Record<string, unknown> = {}): OpenObserveClient {
  return {
    org: "example-org",
    configuredLogStream: "app_logs",
    configuredTraceStream: "app_traces",
    listStreams: vi.fn(async () => ({ list: [], total: 0 })),
    listOrganizations: vi.fn(async () => []),
    search: vi.fn(async () => ({ hits: [], total: 0 })),
    latestTraces: vi.fn(async () => ({ hits: [], total: 0 })),
    ...overrides,
  } as unknown as OpenObserveClient;
}

describe("commands", () => {
  it("returns four compact fields for log results and emits a full-text SQL query", async () => {
    const search = vi.fn(async () => ({
      hits: [{ _timestamp: 1_788_566_400_000_000, service_name: "api", level: "error", body: "failed", extra: "hidden" }],
      total: 1,
      took: 2,
    }));
    const output = await logsCommand(["failure", "--limit", "1"], fakeClient({ search }));
    expect(output).toMatchObject({ count: "1 log results", results: [{ timestamp: "2026-09-05T00:00:00.000Z", service: "api", level: "error", message: "failed" }] });
    expect(Object.keys((output as { results: Record<string, unknown>[] }).results[0] ?? {})).toHaveLength(4);
    expect(search.mock.calls[0]?.[0].query.sql).toContain("match_all('failure')");
    expect((output as { help: string[] }).help.join(" ")).toContain("--stream 'app_logs'");
    expect((output as { help: string[] }).help.join(" ")).toContain("--start");
  });

  it("makes empty log and stream results definitive", async () => {
    const logs = await logsCommand([], fakeClient({ search: vi.fn(async () => ({ hits: [], total: 0 })) }));
    expect(logs).toMatchObject({ count: 0, results: "0 log results found" });
    const streams = await streamsCommand(["--type", "logs"], fakeClient());
    expect(streams).toMatchObject({ count: 0 });
    expect((streams as { streams: string }).streams).toContain("0 logs streams");
  });

  it("keeps arbitrary SQL projections useful without exceeding four default fields", async () => {
    const search = vi.fn(async () => ({
      hits: [{ service_name: "api", count: 42, environment: "dev", region: "east", hidden: "full only" }],
      total: 1,
    }));
    const output = await logsCommand(["--sql", "SELECT service_name, count(*) AS count FROM app_logs GROUP BY service_name"], fakeClient({ search }));
    const row = (output as { results: Record<string, unknown>[] }).results[0] ?? {};
    expect(row).toMatchObject({ service_name: "api", count: 42 });
    expect(Object.keys(row)).toHaveLength(4);
    expect((output as { help: string[] }).help).toContain("Add `--full` to return complete records and messages");
  });

  it("compacts trace summaries and retrieves trace spans through trace search", async () => {
    const traceId = "0123456789abcdef0123456789abcdef";
    const latestTraces = vi.fn(async () => ({
      hits: [{ trace_id: traceId, duration: 12, spans: [2, 1], service_name: [{ service_name: "api" }], first_event: { operation_name: "GET /health" } }],
      total: 1,
    }));
    const listed = await tracesCommand(["search", "--service", "api", "--limit", "1"], fakeClient({ latestTraces }));
    expect(listed).toMatchObject({ traces: [{ traceId, root: "GET /health", services: "api", summary: "12us; 2 spans; 1 errors" }] });
    expect(latestTraces.mock.calls[0]?.[0].filter).toBe("service_name = 'api'");
    expect((listed as { help: string[] }).help.join(" ")).toContain("--stream 'app_traces'");

    const search = vi.fn(async () => ({
      hits: [{ trace_id: traceId, span_id: "span1", service_name: "api", operation_name: "GET /health", span_status: "OK", start_time: 1_788_566_400_000_000_000, end_time: 1_788_566_400_001_000_000 }],
      total: 1,
    }));
    const detail = await tracesCommand(["get", traceId], fakeClient({ search }));
    expect(detail).toMatchObject({ count: "1 spans", spans: [{ spanId: "span1", service: "api", operation: "GET /health", status: "OK" }] });
    expect(search.mock.calls[0]?.[1]).toBe("traces");
  });
});
