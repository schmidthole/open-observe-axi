import { AxiError } from "axi-sdk-js";

export interface OpenObserveConfig {
  url: URL;
  org: string;
  email: string;
  token: string;
  insecure: boolean;
  logStream?: string;
  traceStream?: string;
}

function configured(name: string, value: string | undefined): string {
  const result = value?.trim();
  if (!result) {
    throw new AxiError(`${name} is not set`, "AUTH_ERROR", [
      `Export ${name}; run \`open-observe-axi --help\` for all required settings`,
    ]);
  }
  return result;
}

export function environmentFlag(value: string | undefined): boolean {
  if (value === undefined || value.trim() === "" || value === "0" || value.toLowerCase() === "false") return false;
  if (value === "1" || value.toLowerCase() === "true") return true;
  throw new AxiError("OPENOBSERVE_INSECURE must be 0, 1, false, or true", "VALIDATION_ERROR");
}

export function readConfig(options: { insecure?: boolean; env?: NodeJS.ProcessEnv } = {}): OpenObserveConfig {
  const env = options.env ?? process.env;
  const rawUrl = configured("OPENOBSERVE_URL", env.OPENOBSERVE_URL);
  let url: URL;
  try {
    url = new URL(rawUrl.endsWith("/") ? rawUrl : `${rawUrl}/`);
  } catch {
    throw new AxiError("OPENOBSERVE_URL is not a valid URL", "VALIDATION_ERROR");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AxiError("OPENOBSERVE_URL must use http or https", "VALIDATION_ERROR");
  }
  const insecure = options.insecure === true || environmentFlag(env.OPENOBSERVE_INSECURE);
  if (insecure && url.protocol !== "https:") {
    throw new AxiError("--insecure only applies to HTTPS OpenObserve URLs", "VALIDATION_ERROR");
  }
  return {
    url,
    org: env.OPENOBSERVE_ORG?.trim() || "default",
    email: configured("OPENOBSERVE_EMAIL", env.OPENOBSERVE_EMAIL),
    token: configured("OPENOBSERVE_TOKEN", env.OPENOBSERVE_TOKEN),
    insecure,
    ...(env.OPENOBSERVE_STREAM?.trim() ? { logStream: env.OPENOBSERVE_STREAM.trim() } : {}),
    ...(env.OPENOBSERVE_TRACE_STREAM?.trim() ? { traceStream: env.OPENOBSERVE_TRACE_STREAM.trim() } : {}),
  };
}
