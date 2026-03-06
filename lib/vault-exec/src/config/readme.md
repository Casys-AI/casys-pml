# config

Technical configuration loading for `vault-exec`.

## Responsibilities

- load persisted local configuration for vault-scoped features
- normalize and validate configuration payloads before workflows consume them
- keep missing-config behavior explicit and deterministic

## Boundaries

- no workflow orchestration
- no filesystem watch/service logic
- no KV persistence
- no silent fallback to malformed config

## Notes

- config is local to a vault unless a feature explicitly states otherwise
- config parsing must fail fast on malformed content
