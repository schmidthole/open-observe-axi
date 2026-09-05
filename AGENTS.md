# AGENTS.md

## Project map

- `bin/open-observe-axi.ts` is the dependency-light executable boundary. Keep version handling ahead of the dynamic CLI import.
- `src/cli.ts` owns top-level AXI dispatch, global output/TLS flags, the live home view, and structured errors.
- `src/client.ts` is the only OpenObserve transport. It reads environment configuration, sends HTTP Basic auth, applies TLS policy per request, and translates API failures.
- `src/commands/` owns logs, traces, discovery, and explicit hook setup. Commands return JSON-shaped objects; the AXI boundary renders TOON by default.
- `src/args.ts`, `src/time.ts`, and `src/output.ts` centralize strict parsing, time-range normalization, minimal schemas, and truncation.
- `src/help.ts` is shared by CLI help and `scripts/build-skill.ts`; CI rejects a stale generated skill.

## API compatibility

The v1 contracts were live-verified against OpenObserve v0.92.1: streams use `GET /api/{org}/streams`, organizations use `GET /api/organizations`, SQL search uses `POST /api/{org}/_search` with an optional `type`, and trace summaries use `GET /api/{org}/{stream}/traces/latest`. Keep endpoint changes isolated in `src/client.ts` and cover them with local HTTP-server tests.

## Validation and secrets

Run `npm run typecheck`, `npm test`, `npm run check:skill`, and `npm pack --dry-run`. Live checks require environment-provided URL, org, service-account email, and token; never print, persist, or commit them.

TLS verification is the default. `--insecure` and `OPENOBSERVE_INSECURE=1` are explicit opt-ins implemented per request; do not disable verification process-wide.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
