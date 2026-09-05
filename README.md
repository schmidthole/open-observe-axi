# open-observe-axi

An agent-ergonomic CLI (axi) for [OpenObserve](https://openobserve.ai/), built to the
[axi](https://github.com/kunchenguid/axi) design paradigm. It lets AI agents pull logs and
traces from an OpenObserve instance with token-efficient, agent-readable output.

Status: initial build in progress.

## Configuration

Credentials are read from the environment (never hardcode secrets):

- `OPENOBSERVE_URL` - base URL of the OpenObserve instance
- `OPENOBSERVE_TOKEN` - service-account token (sent as a Bearer token)
- `OPENOBSERVE_ORG` - organization (defaults to `default`)

Never commit tokens or `.env` files.
