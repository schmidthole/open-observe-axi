# open-observe-axi

`open-observe-axi` is an agent-ergonomic CLI for [OpenObserve](https://openobserve.ai/). It gives AI agents compact, live access to logs and distributed traces so they can debug services without spending tokens navigating a web UI or parsing verbose JSON.

It follows the [axi](https://github.com/kunchenguid/axi) design principles: TOON output by default, small list schemas, explicit empty states, structured errors, content-first commands, contextual next steps, strict flag validation, and opt-in session hooks.

## Install

Node.js 20 or newer is required.

```sh
npm install -g open-observe-axi
open-observe-axi --version
```

Until the package is published, install from a checkout:

```sh
npm install
npm run build
npm link
open-observe-axi --version
```

## Connection and authentication

The CLI reads connection settings and credentials only from environment variables. It does not accept credentials as flags or write them to disk.

```sh
export OPENOBSERVE_URL=https://openobserve.example.com
export OPENOBSERVE_ORG=your-org
export OPENOBSERVE_EMAIL=service-account@example.com
export OPENOBSERVE_TOKEN=your-service-account-token
```

`OPENOBSERVE_ORG` defaults to OpenObserve's conventional `default` organization. The email and token are sent as HTTP Basic credentials. Optional stream defaults avoid a discovery request:

```sh
export OPENOBSERVE_STREAM=application-logs
export OPENOBSERVE_TRACE_STREAM=application-traces
```

TLS certificates are verified by default. For a trusted internal instance whose certificate cannot be validated by the local trust store, opt in deliberately for one invocation with `--insecure`, or set `OPENOBSERVE_INSECURE=1`. Never use insecure mode by default.

`.env`, `.env.*`, `.open-observe-axi.json`, and local config patterns are gitignored. [`.env.example`](.env.example) contains placeholders only.

## Content-first usage

No arguments returns recent logs from `OPENOBSERVE_STREAM`, or from the first discovered log stream:

```sh
open-observe-axi
```

TOON is the default. Put `--json` anywhere after the top-level command when JSON interchange is useful:

```sh
open-observe-axi logs --since 30m --json
```

## Log search

Search a stream's recent logs. The default range is 15 minutes and the default limit is 25.

```sh
open-observe-axi logs
open-observe-axi logs search "connection refused" --stream application-logs --since 30m
open-observe-axi logs --start 2026-09-05T02:00:00Z --end 2026-09-05T03:00:00Z
open-observe-axi logs --full
```

The positional query uses OpenObserve full-text search. For complete SQL control, use `--sql`; the time bounds and result limit still come from CLI flags:

```sh
open-observe-axi logs \
  --sql 'SELECT service_name, count(*) AS count FROM "application-logs" GROUP BY service_name ORDER BY count DESC' \
  --since 1h
```

Default log rows contain four decision-making fields: timestamp, service, level, and a truncated message. `--full` returns complete OpenObserve records.

## Traces

Search recent trace summaries, optionally by service:

```sh
open-observe-axi traces
open-observe-axi traces search --service api --since 1h
open-observe-axi traces search --filter "span_status = 'ERROR'" --since 30m
open-observe-axi traces search --full
```

Retrieve spans for a trace ID. The default detail lookback is 24 hours; broaden it when retrieving older traces.

```sh
open-observe-axi traces get 0123456789abcdef0123456789abcdef
open-observe-axi traces get 0123456789abcdef0123456789abcdef --since 7d
open-observe-axi traces get 0123456789abcdef0123456789abcdef --full
```

Trace summaries combine duration, span count, and error count into one compact field. Default span rows contain four fields; `--full` exposes every stored span attribute.

## Discovery

Discover ambient context before forming queries:

```sh
open-observe-axi streams
open-observe-axi streams --type logs
open-observe-axi streams --type traces --full
open-observe-axi orgs
```

Every command supports scoped `--help`, and unknown flags fail before any network request.

## Optional agent integration

The explicit setup command installs or repairs SessionStart integrations for Claude Code, Codex, and OpenCode. Ordinary CLI use never changes agent configuration.

```sh
open-observe-axi setup hooks
open-observe-axi setup hooks --scope project
open-observe-axi setup status
open-observe-axi setup remove
```

An installable agent skill is packaged at [`skills/open-observe-axi/SKILL.md`](skills/open-observe-axi/SKILL.md). It is generated from the CLI's shared help source; CI rejects stale generated content. Users need only one integration path, though hooks and the skill can be used together.

```sh
npx skills add schmidthole/open-observe-axi --skill open-observe-axi
```

## Development

```sh
npm install
npm run typecheck
npm test
npm run check:skill
npm pack --dry-run
```

Tests use local mock servers and placeholder credentials only. Live validation requires the four `OPENOBSERVE_*` connection variables and must never print or commit the token.

The v1 endpoint contracts were verified against OpenObserve v0.92.1.

## Roadmap

The focused v1 covers logs, traces, streams, and organizations. Possible later extensions include:

- metrics queries;
- bulk export and streaming output;
- saved views and dashboards.

These are intentionally not part of v1.
