import http from "node:http";
import https from "node:https";
import { AxiError } from "axi-sdk-js";
import { readConfig, type OpenObserveConfig } from "./config.js";
import { VERSION } from "./version.js";

export type StreamType = "logs" | "traces";
export type JsonObject = Record<string, unknown>;

export interface StreamRecord extends JsonObject {
  name: string;
  stream_type: string;
  stats?: JsonObject;
}

export interface StreamResponse {
  list: StreamRecord[];
  total: number;
}

export interface SearchRequest {
  query: {
    sql: string;
    start_time: number;
    end_time: number;
    from: number;
    size: number;
  };
  search_type?: string;
  timeout?: number;
}

export interface SearchResponse extends JsonObject {
  took?: number;
  hits: JsonObject[];
  total?: number;
  from?: number;
  size?: number;
  scan_records?: number;
  scan_size?: number;
  is_partial?: boolean;
}

export interface LatestTracesResponse extends JsonObject {
  took?: number;
  total?: number;
  from?: number;
  size?: number;
  hits: JsonObject[];
}

export class OpenObserveClient {
  #config: OpenObserveConfig | undefined;
  readonly #insecure: boolean | undefined;

  constructor(options: { insecure?: boolean; config?: OpenObserveConfig } = {}) {
    this.#config = options.config;
    this.#insecure = options.insecure;
  }

  private get config(): OpenObserveConfig {
    this.#config ??= readConfig(this.#insecure === undefined ? {} : { insecure: this.#insecure });
    return this.#config;
  }

  get org(): string {
    return this.config.org;
  }

  get configuredLogStream(): string | undefined {
    return this.config.logStream;
  }

  get configuredTraceStream(): string | undefined {
    return this.config.traceStream;
  }

  async listStreams(type?: StreamType): Promise<StreamResponse> {
    const query = type ? `?type=${encodeURIComponent(type)}` : "";
    const payload = await this.request<Partial<StreamResponse>>(`/api/${encodeURIComponent(this.org)}/streams${query}`);
    return {
      list: Array.isArray(payload.list) ? payload.list : [],
      total: typeof payload.total === "number" ? payload.total : (payload.list?.length ?? 0),
    };
  }

  async listOrganizations(): Promise<JsonObject[]> {
    const payload = await this.request<{ data?: unknown }>("/api/organizations");
    return Array.isArray(payload.data) ? payload.data.filter(isObject) : [];
  }

  async search(request: SearchRequest, type?: StreamType): Promise<SearchResponse> {
    const query = type ? `?type=${encodeURIComponent(type)}` : "";
    const payload = await this.request<Partial<SearchResponse>>(`/api/${encodeURIComponent(this.org)}/_search${query}`, {
      method: "POST",
      body: request,
    });
    return { ...payload, hits: Array.isArray(payload.hits) ? payload.hits.filter(isObject) : [] };
  }

  async latestTraces(options: {
    stream: string;
    startTime: number;
    endTime: number;
    offset?: number;
    limit: number;
    filter?: string;
  }): Promise<LatestTracesResponse> {
    const params = new URLSearchParams({
      start_time: String(options.startTime),
      end_time: String(options.endTime),
      from: String(options.offset ?? 0),
      size: String(options.limit),
      filter: options.filter ?? "",
    });
    const payload = await this.request<Partial<LatestTracesResponse>>(
      `/api/${encodeURIComponent(this.org)}/${encodeURIComponent(options.stream)}/traces/latest?${params.toString()}`,
    );
    return { ...payload, hits: Array.isArray(payload.hits) ? payload.hits.filter(isObject) : [] };
  }

  async request<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
    const config = this.config;
    const url = new URL(path.replace(/^\//, ""), config.url);
    const authorization = `Basic ${Buffer.from(`${config.email}:${config.token}`, "utf8").toString("base64")}`;
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const transport = url.protocol === "https:" ? https : http;

    const result = await new Promise<{ status: number; body: string; contentType: string }>((resolve, reject) => {
      const request = transport.request(url, {
        method: options.method ?? "GET",
        headers: {
          Authorization: authorization,
          Accept: "application/json",
          "User-Agent": `open-observe-axi/${VERSION}`,
          ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
        },
        ...(url.protocol === "https:" ? { rejectUnauthorized: !config.insecure } : {}),
        timeout: 30_000,
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on("end", () => resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
          contentType: String(response.headers["content-type"] ?? ""),
        }));
      });
      request.on("timeout", () => request.destroy(Object.assign(new Error("request timed out"), { name: "TimeoutError" })));
      request.on("error", reject);
      if (body) request.write(body);
      request.end();
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/certificate|self[- ]signed|unable to verify/i.test(message)) {
        throw new AxiError("OpenObserve TLS certificate verification failed", "NETWORK_ERROR", [
          "Install the trusted CA, or explicitly retry with --insecure for this instance",
        ]);
      }
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new AxiError("OpenObserve API request timed out", "NETWORK_ERROR", ["Narrow the time range or retry the command"]);
      }
      throw new AxiError(`Could not reach OpenObserve: ${sanitize(message, config)}`, "NETWORK_ERROR", [
        "Check OPENOBSERVE_URL and network access, then retry",
      ]);
    });

    let payload: unknown;
    try {
      payload = result.body.trim() === "" ? {} : JSON.parse(result.body);
    } catch {
      if (result.status >= 200 && result.status < 300) {
        throw new AxiError(`OpenObserve returned an unreadable response (HTTP ${result.status})`, "API_ERROR");
      }
      payload = undefined;
    }

    if (result.status < 200 || result.status >= 300) {
      const detail = apiErrorMessage(payload) ?? result.body.trim() ?? `HTTP ${result.status}`;
      const safeDetail = sanitize(detail, config);
      if (result.status === 401 || result.status === 403) {
        throw new AxiError(`OpenObserve authentication failed: ${safeDetail}`, "AUTH_ERROR", [
          "Check OPENOBSERVE_EMAIL, OPENOBSERVE_TOKEN, and OPENOBSERVE_ORG",
        ]);
      }
      const suggestions = apiSuggestions(payload).map((suggestion) => sanitize(suggestion, config));
      throw new AxiError(`OpenObserve API error (HTTP ${result.status}): ${safeDetail}`, "API_ERROR", suggestions);
    }
    return payload as T;
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiErrorMessage(payload: unknown): string | undefined {
  if (!isObject(payload)) return undefined;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  if (isObject(payload.error)) {
    const parts = [payload.error.message, payload.error.details].filter((value): value is string => typeof value === "string");
    if (parts.length) return parts.join(": ");
  }
  return undefined;
}

function apiSuggestions(payload: unknown): string[] {
  if (!isObject(payload)) return [];
  const result: string[] = [];
  if (typeof payload.hint === "string") result.push(payload.hint);
  if (Array.isArray(payload.suggestions)) {
    const suggestions = payload.suggestions.filter((value): value is string => typeof value === "string");
    if (suggestions.length) result.push(`Closest valid values: ${suggestions.join(", ")}`);
  }
  return result;
}

function sanitize(message: string, config: OpenObserveConfig): string {
  const basic = Buffer.from(`${config.email}:${config.token}`, "utf8").toString("base64");
  return message
    .split(config.token).join("[redacted]")
    .split(basic).join("[redacted]")
    .replace(/Basic\s+\S+/gi, "Basic [redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();
}
