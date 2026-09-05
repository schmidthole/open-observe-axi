export const TOP_LEVEL_HELP = `usage: open-observe-axi [command] [args] [flags]
commands[5]:
  logs, traces, streams, orgs, setup
flags[4]:
  --json (after command), --insecure, --help, -v/-V/--version
configuration[7]:
  OPENOBSERVE_URL, OPENOBSERVE_ORG, OPENOBSERVE_EMAIL, OPENOBSERVE_TOKEN,
  OPENOBSERVE_STREAM (optional), OPENOBSERVE_TRACE_STREAM (optional), OPENOBSERVE_INSECURE (optional)
examples:
  open-observe-axi
  open-observe-axi logs "connection refused" --since 30m
  open-observe-axi traces --service api --since 1h
  open-observe-axi traces get <trace-id> --since 24h
  open-observe-axi streams --type logs
  open-observe-axi setup hooks
`;

export const SKILL_GUIDE = `Use open-observe-axi to inspect OpenObserve logs and distributed traces without opening the web app.

Authentication and connection settings come only from the environment. Set OPENOBSERVE_URL, OPENOBSERVE_EMAIL, and OPENOBSERVE_TOKEN. Set OPENOBSERVE_ORG when the instance does not use the conventional default organization. The service-account email and token are sent with HTTP Basic authentication. OPENOBSERVE_STREAM and OPENOBSERVE_TRACE_STREAM provide optional defaults.

Command map:
- logs: recent log search, full-text query, stream/time filters, and a raw OpenObserve SQL escape hatch
- traces search: recent trace summaries filtered by service/time or a raw trace filter
- traces get: spans for a trace ID
- streams: discover log and trace streams
- orgs: discover accessible organizations
- setup: install, inspect, or remove SessionStart integrations

Output is concise TOON by default. Add --json after the command for JSON. List items use compact schemas; add --full for complete OpenObserve records. Time flags accept --since (15m, 2h, 7d) or --start/--end (ISO-8601 or Unix timestamps).

TLS verification is enabled by default. Use --insecure or OPENOBSERVE_INSECURE=1 only as an explicit opt-in for an instance with an untrusted certificate.

Run open-observe-axi <command> --help or open-observe-axi traces <action> --help for concise references. All commands are non-interactive and reject unknown flags.
`;
