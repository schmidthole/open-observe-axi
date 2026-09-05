import { AxiError } from "axi-sdk-js";
import {
  booleanFlag,
  boundedLimit,
  commandHelp,
  integerFlag,
  parseArgs,
  stringFlag,
  type CommandDefinition,
} from "../args.js";
import { type JsonObject, type OpenObserveClient, type SearchRequest } from "../client.js";
import { compact, microsecondsToIso, numericValue, stringValue, truncate, type OutputRecord } from "../output.js";
import { resolveTimeRange, TIME_FLAGS } from "../time.js";

const GROUP_HELP = `usage: open-observe-axi traces [search|get] [args] [flags]
subcommands[2]:
  search  Search trace summaries by service and time range (default)
  get     Retrieve spans for a trace ID
examples:
  open-observe-axi traces
  open-observe-axi traces search --service api --since 30m
  open-observe-axi traces get <trace-id> --since 24h
`;

const SEARCH_DEFINITION: CommandDefinition = {
  usage: "open-observe-axi traces search",
  description: "Search trace summaries by service and time range",
  flags: {
    "--stream": { type: "string", description: "Trace stream (default OPENOBSERVE_TRACE_STREAM or first discovered trace stream)" },
    "--service": { type: "string", description: "Filter traces containing this service_name" },
    "--filter": { type: "string", description: "Raw OpenObserve trace filter; cannot be combined with --service" },
    "--limit": { type: "integer", description: "Maximum traces, 1-250 (default 25)" },
    "--offset": { type: "integer", description: "Result offset (default 0)" },
    "--full": { type: "boolean", description: "Return complete trace summary records" },
    ...TIME_FLAGS,
  },
  examples: [
    "open-observe-axi traces search",
    "open-observe-axi traces search --service core --since 30m",
    "open-observe-axi traces search --filter \"span_status = 'ERROR'\" --since 1h --full",
  ],
};

const GET_DEFINITION: CommandDefinition = {
  usage: "open-observe-axi traces get <trace-id>",
  description: "Retrieve spans for one trace ID",
  positionals: [{ name: "trace-id", required: true }],
  flags: {
    "--stream": { type: "string", description: "Trace stream (default OPENOBSERVE_TRACE_STREAM or first discovered trace stream)" },
    "--limit": { type: "integer", description: "Maximum spans, 1-250 (default 250)" },
    "--full": { type: "boolean", description: "Return complete span records" },
    ...TIME_FLAGS,
  },
  examples: [
    "open-observe-axi traces get 0123456789abcdef0123456789abcdef",
    "open-observe-axi traces get 0123456789abcdef0123456789abcdef --since 7d",
    "open-observe-axi traces get 0123456789abcdef0123456789abcdef --full",
  ],
};

export async function tracesCommand(args: string[], client: OpenObserveClient): Promise<OutputRecord | string> {
  if (args.length === 1 && args[0] === "--help") return GROUP_HELP;
  const action = args[0] && !args[0].startsWith("-") ? args[0] : "search";
  if (action === "search") return searchTraces(action === args[0] ? args.slice(1) : args, client);
  if (action === "get") return getTrace(args.slice(1), client);
  throw new AxiError(`Unknown traces action: ${action}`, "VALIDATION_ERROR", ["Use search or get", "Run `open-observe-axi traces --help`"]);
}

async function searchTraces(args: string[], client: OpenObserveClient): Promise<OutputRecord | string> {
  if (args.length === 1 && args[0] === "--help") return commandHelp(SEARCH_DEFINITION);
  const parsed = parseArgs(args, SEARCH_DEFINITION);
  const service = stringFlag(parsed, "--service");
  const rawFilter = stringFlag(parsed, "--filter");
  if (service && rawFilter) throw new AxiError("Use only one of --service or --filter", "VALIDATION_ERROR");
  const stream = await resolveTraceStream(client, stringFlag(parsed, "--stream"));
  if (!stream) return noTraceStreams(client);
  const limit = boundedLimit(parsed);
  const offset = integerFlag(parsed, "--offset") ?? 0;
  const range = resolveTimeRange(parsed);
  const filter = rawFilter ?? (service ? `service_name = '${escapeSqlLiteral(service)}'` : "");
  const response = await client.latestTraces({
    stream,
    startTime: range.startTime,
    endTime: range.endTime,
    offset,
    limit,
    filter,
  });
  const full = booleanFlag(parsed, "--full");
  let anyTruncated = false;
  const traces = full ? response.hits : response.hits.map((hit) => {
    const formatted = compactTrace(hit);
    if (formatted.truncated) anyTruncated = true;
    return formatted.record;
  });
  if (traces.length === 0) {
    return {
      count: 0,
      traces: "0 traces found",
      stream,
      timeRange: { start: range.start, end: range.end },
      help: ["Broaden --since or remove the service/filter", "Run `open-observe-axi streams --type traces` to inspect trace streams"],
    };
  }
  return compact({
    count: `${traces.length} traces`,
    stream,
    timeRange: { start: range.start, end: range.end },
    tookMs: response.took,
    traces,
    help: [
      ...(anyTruncated ? ["Add `--full` to return complete trace summary records"] : []),
      "Run `open-observe-axi traces get <trace-id> --since 24h` for spans",
      ...(traces.length === limit ? [
        `Run \`${traceNextPageCommand({
          stream,
          service,
          filter: rawFilter,
          start: range.start,
          end: range.end,
          limit,
          offset: offset + traces.length,
          full,
          insecure: process.argv.includes("--insecure"),
        })}\` for the next ${limit} traces`,
      ] : []),
    ],
  });
}

async function getTrace(args: string[], client: OpenObserveClient): Promise<OutputRecord | string> {
  if (args.length === 1 && args[0] === "--help") return commandHelp(GET_DEFINITION);
  const parsed = parseArgs(args, GET_DEFINITION);
  const traceId = parsed.positionals[0] as string;
  if (!/^[0-9a-fA-F]{16,32}$/.test(traceId)) {
    throw new AxiError("trace-id must be 16-32 hexadecimal characters", "VALIDATION_ERROR");
  }
  const stream = await resolveTraceStream(client, stringFlag(parsed, "--stream"));
  if (!stream) return noTraceStreams(client);
  const limit = boundedLimit(parsed, 250);
  const range = resolveTimeRange(parsed, { defaultSince: "24h" });
  const sql = `SELECT * FROM ${quoteIdentifier(stream)} WHERE trace_id = '${traceId}' ORDER BY start_time`;
  const request: SearchRequest = {
    query: { sql, start_time: range.startTime, end_time: range.endTime, from: 0, size: limit },
    search_type: "ui",
    timeout: 30,
  };
  const response = await client.search(request, "traces");
  if (response.hits.length === 0) {
    return {
      count: 0,
      trace: `0 spans found for trace ${traceId}`,
      stream,
      timeRange: { start: range.start, end: range.end },
      help: ["Retry with a broader range such as `--since 7d`", "Run `open-observe-axi traces search` to find recent trace IDs"],
    };
  }
  const summary = traceSummary(traceId, response.hits);
  const full = booleanFlag(parsed, "--full");
  const spans = full ? response.hits : response.hits.map(compactSpan);
  return {
    trace: summary,
    count: `${spans.length} spans`,
    stream,
    timeRange: { start: range.start, end: range.end },
    spans,
    ...(!full ? { help: ["Add `--full` to return complete span records"] } : {}),
  };
}

async function resolveTraceStream(client: OpenObserveClient, requested: string | undefined): Promise<string | undefined> {
  if (requested) return requested;
  if (client.configuredTraceStream) return client.configuredTraceStream;
  const streams = await client.listStreams("traces");
  return streams.list[0]?.name;
}

function noTraceStreams(client: OpenObserveClient): OutputRecord {
  return {
    count: 0,
    traces: `0 trace streams found in organization ${client.org}`,
    help: ["Run `open-observe-axi streams --type traces` to confirm stream availability"],
  };
}

function compactTrace(hit: JsonObject): { record: OutputRecord; truncated: boolean } {
  const services = traceServices(hit);
  const spans = Array.isArray(hit.spans) ? hit.spans : [];
  const spanCount = numericValue(spans[0]);
  const errorCount = numericValue(spans[1]);
  const first = typeof hit.first_event === "object" && hit.first_event !== null ? hit.first_event as JsonObject : {};
  const root = truncate(stringValue(first.operation_name) ?? stringValue(first.service_name) ?? "", 180);
  const serviceList = truncate(services.join(", "), 180);
  const summary = [
    numericValue(hit.duration) !== undefined ? `${numericValue(hit.duration)}us` : undefined,
    spanCount !== undefined ? `${spanCount} spans` : undefined,
    errorCount !== undefined ? `${errorCount} errors` : undefined,
  ].filter(Boolean).join("; ");
  return {
    record: compact({ traceId: hit.trace_id, root: root.text, services: serviceList.text, summary }),
    truncated: root.truncated || serviceList.truncated,
  };
}

function traceServices(hit: JsonObject): string[] {
  if (!Array.isArray(hit.service_name)) return stringValue(hit.service_name) ? [String(hit.service_name)] : [];
  return hit.service_name.flatMap((value) => {
    if (typeof value === "string") return [value];
    if (typeof value === "object" && value !== null && typeof (value as JsonObject).service_name === "string") {
      return [String((value as JsonObject).service_name)];
    }
    return [];
  });
}

function compactSpan(span: JsonObject): OutputRecord {
  const statusCode = numericValue(span.status_code);
  const status = stringValue(span.span_status) ?? (statusCode && statusCode !== 0 ? `ERROR(${statusCode})` : "UNSET");
  return compact({
    spanId: span.span_id,
    service: span.service_name,
    operation: span.operation_name,
    status,
  });
}

function traceSummary(traceId: string, spans: JsonObject[]): OutputRecord {
  const services = [...new Set(spans.flatMap((span) => stringValue(span.service_name) ? [String(span.service_name)] : []))];
  const starts = spans.flatMap((span) => {
    const start = numericValue(span.start_time);
    if (start !== undefined) return [start];
    const timestamp = numericValue(span._timestamp);
    return timestamp === undefined ? [] : [timestamp * 1_000];
  });
  const ends = spans.flatMap((span) => numericValue(span.end_time) !== undefined ? [numericValue(span.end_time) as number] : []);
  const first = starts.length ? Math.min(...starts) : undefined;
  const last = ends.length ? Math.max(...ends) : undefined;
  const errors = spans.filter((span) => stringValue(span.span_status) === "ERROR" || (numericValue(span.status_code) ?? 0) !== 0).length;
  return compact({
    traceId,
    services: services.join(", "),
    durationUs: first !== undefined && last !== undefined ? Math.round((last - first) / 1_000) : undefined,
    startedAt: first !== undefined ? microsecondsToIso(first) : undefined,
    errors,
  });
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function traceNextPageCommand(options: {
  stream?: string | undefined;
  service?: string | undefined;
  filter?: string | undefined;
  start?: string | undefined;
  end?: string | undefined;
  limit: number;
  offset: number;
  full: boolean;
  insecure: boolean;
}): string {
  const parts = ["open-observe-axi traces search"];
  if (options.stream) parts.push("--stream", shellQuote(options.stream));
  if (options.service) parts.push("--service", shellQuote(options.service));
  if (options.filter) parts.push("--filter", shellQuote(options.filter));
  if (options.start) parts.push("--start", shellQuote(options.start));
  if (options.end) parts.push("--end", shellQuote(options.end));
  parts.push("--limit", String(options.limit), "--offset", String(options.offset));
  if (options.full) parts.push("--full");
  if (options.insecure) parts.push("--insecure");
  return parts.join(" ");
}
