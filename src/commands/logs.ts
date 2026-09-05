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
import { compact, microsecondsToIso, stringValue, truncate, type OutputRecord } from "../output.js";
import { resolveTimeRange, TIME_FLAGS } from "../time.js";

const DEFINITION: CommandDefinition = {
  usage: "open-observe-axi logs [search] [query]",
  description: "Search recent logs; query is full-text and --sql accepts OpenObserve SQL",
  positionals: [{ name: "query" }],
  flags: {
    "--stream": { type: "string", description: "Log stream (default OPENOBSERVE_STREAM or first discovered log stream)" },
    "--sql": { type: "string", description: "Complete SQL query; cannot be combined with query or --stream" },
    "--limit": { type: "integer", description: "Maximum results, 1-250 (default 25)" },
    "--offset": { type: "integer", description: "Result offset (default 0)" },
    "--full": { type: "boolean", description: "Return complete log records without message truncation" },
    ...TIME_FLAGS,
  },
  examples: [
    "open-observe-axi logs",
    "open-observe-axi logs search \"connection refused\" --stream app --since 30m",
    "open-observe-axi logs --sql 'SELECT service_name, count(*) AS count FROM \"app\" GROUP BY service_name' --since 1h",
  ],
};

export async function logsCommand(args: string[], client: OpenObserveClient): Promise<OutputRecord | string> {
  if (args[0] === "search") args = args.slice(1);
  if (args.length === 1 && args[0] === "--help") return commandHelp(DEFINITION);
  const parsed = parseArgs(args, DEFINITION);
  const query = parsed.positionals[0];
  const rawSql = stringFlag(parsed, "--sql");
  const requestedStream = stringFlag(parsed, "--stream");
  if (rawSql && query) throw new AxiError("Use only one of query or --sql", "VALIDATION_ERROR");
  if (rawSql && requestedStream) throw new AxiError("--stream cannot be combined with --sql; name the stream in SQL", "VALIDATION_ERROR");

  const limit = boundedLimit(parsed);
  const offset = integerFlag(parsed, "--offset") ?? 0;
  const range = resolveTimeRange(parsed);
  const stream = rawSql ? undefined : await resolveLogStream(client, requestedStream);
  if (!rawSql && !stream) {
    return {
      count: 0,
      results: `0 log streams found in organization ${client.org}`,
      help: ["Run `open-observe-axi streams --type logs` to confirm stream availability"],
    };
  }
  const sql = rawSql ?? buildLogSql(stream as string, query);
  const request: SearchRequest = {
    query: { sql, start_time: range.startTime, end_time: range.endTime, from: offset, size: limit },
    search_type: "ui",
    timeout: 30,
  };
  const response = await client.search(request, "logs");
  const full = booleanFlag(parsed, "--full");
  let anyTruncated = false;
  const results = full ? response.hits : response.hits.map((hit) => {
    const formatted = rawSql && !hasLogContent(hit) ? compactSqlRow(hit) : compactLog(hit);
    if (formatted.truncated) anyTruncated = true;
    return formatted.record;
  });
  const command = commandForNextPage({
    query,
    rawSql,
    requestedStream: stream,
    limit,
    offset: offset + results.length,
    start: range.start,
    end: range.end,
    full,
    insecure: process.argv.includes("--insecure"),
  });
  if (results.length === 0) {
    return {
      count: 0,
      results: "0 log results found",
      stream: stream ?? "selected by SQL",
      timeRange: { start: range.start, end: range.end },
      tookMs: response.took,
      help: ["Broaden --since or remove the query", "Run `open-observe-axi streams --type logs` to inspect available streams"],
    };
  }
  const help = [
    ...(anyTruncated ? ["Add `--full` to return complete records and messages"] : []),
    ...(results.length === limit ? [`Run \`${command}\` for the next ${limit} results`] : []),
  ];
  return compact({
    count: `${results.length} log results`,
    stream: stream ?? "selected by SQL",
    timeRange: { start: range.start, end: range.end },
    tookMs: response.took,
    scannedRecords: response.scan_records,
    partial: response.is_partial === true ? true : undefined,
    results,
    help: help.length ? help : undefined,
  });
}

async function resolveLogStream(client: OpenObserveClient, requested: string | undefined): Promise<string | undefined> {
  if (requested) return requested;
  if (client.configuredLogStream) return client.configuredLogStream;
  const streams = await client.listStreams("logs");
  return streams.list[0]?.name;
}

function buildLogSql(stream: string, query: string | undefined): string {
  const where = query ? ` WHERE match_all('${escapeSqlLiteral(query)}')` : "";
  return `SELECT * FROM ${quoteIdentifier(stream)}${where} ORDER BY _timestamp DESC`;
}

function compactLog(hit: JsonObject): { record: OutputRecord; truncated: boolean } {
  const content = hit.body ?? hit.message ?? hit.msg ?? hit.log ?? hit.record_message ?? hit.error ?? "";
  const message = truncate(content, 500);
  return {
    truncated: message.truncated,
    record: compact({
      timestamp: microsecondsToIso(hit._timestamp),
      service: stringValue(hit.service_name) ?? stringValue(hit.service) ?? stringValue(hit.k8s_container_name),
      level: stringValue(hit.level) ?? stringValue(hit.severity_text) ?? stringValue(hit.span_status) ?? hit.severity,
      message: message.text,
    }),
  };
}

function hasLogContent(hit: JsonObject): boolean {
  return [hit.body, hit.message, hit.msg, hit.log, hit.record_message, hit.error].some((value) => value !== undefined && value !== null);
}

function compactSqlRow(hit: JsonObject): { record: OutputRecord; truncated: boolean } {
  let truncated = Object.keys(hit).length > 4;
  const entries = Object.entries(hit).slice(0, 4).map(([key, value]) => {
    if (key === "_timestamp") return [key, microsecondsToIso(value) ?? value] as const;
    if (typeof value === "string" || (typeof value === "object" && value !== null)) {
      const preview = truncate(value, 500);
      if (preview.truncated) truncated = true;
      return [key, preview.text] as const;
    }
    return [key, value] as const;
  });
  return { record: Object.fromEntries(entries), truncated };
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

function commandForNextPage(options: {
  query?: string | undefined;
  rawSql?: string | undefined;
  requestedStream?: string | undefined;
  limit: number;
  offset: number;
  start?: string | undefined;
  end?: string | undefined;
  full: boolean;
  insecure: boolean;
}): string {
  const parts = ["open-observe-axi logs"];
  if (options.query) parts.push(shellQuote(options.query));
  if (options.rawSql) parts.push("--sql", shellQuote(options.rawSql));
  if (options.requestedStream) parts.push("--stream", shellQuote(options.requestedStream));
  if (options.start) parts.push("--start", shellQuote(options.start));
  if (options.end) parts.push("--end", shellQuote(options.end));
  parts.push("--limit", String(options.limit), "--offset", String(options.offset));
  if (options.full) parts.push("--full");
  if (options.insecure) parts.push("--insecure");
  return parts.join(" ");
}
