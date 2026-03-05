# TOOL Decomposition (L2/L3) from OpenClaw Traces

Date: 2026-03-05

## Scope and Data Coverage
- Analyzed `199` OpenClaw session files from `~/.openclaw/agents/*/sessions/*.jsonl`.
- Parsed `8,106` tool-call events (`assistant` content items with `type: toolCall`).
- Loaded `notebooks/executed/tool_arg_profiles.json` (`15` tools profiled for argument variability).
- Minor drift between sources on top tools (`exec +4`, `process +1`, `read +1`, `edit +1` in raw sessions vs profile snapshot), consistent with snapshot timing.

## 1) Tool Inventory Ranked by Volume

| Rank | Tool | Calls | Share | Sessions | In `tool_arg_profiles.json` |
|---:|---|---:|---:|---:|---|
| 1 | `exec` | 5370 | 66.25% | 179 | yes |
| 2 | `process` | 553 | 6.82% | 129 | yes |
| 3 | `read` | 492 | 6.07% | 48 | yes |
| 4 | `edit` | 361 | 4.45% | 35 | yes |
| 5 | `write` | 253 | 3.12% | 35 | yes |
| 6 | `browser` | 210 | 2.59% | 14 | yes |
| 7 | `web_fetch` | 129 | 1.59% | 20 | yes |
| 8 | `cron` | 112 | 1.38% | 14 | yes |
| 9 | `message` | 101 | 1.25% | 28 | yes |
| 10 | `memory_search` | 90 | 1.11% | 21 | yes |
| 11 | `sessions_spawn` | 88 | 1.09% | 16 | yes |
| 12 | `web_search` | 80 | 0.99% | 16 | yes |
| 13 | `gateway` | 62 | 0.76% | 15 | yes |
| 14 | `subagents` | 41 | 0.51% | 9 | yes |
| 15 | `image` | 37 | 0.46% | 9 | yes |
| 16 | `sessions_send` | 35 | 0.43% | 11 | no |
| 17 | `sessions_history` | 28 | 0.35% | 12 | no |
| 18 | `session_status` | 25 | 0.31% | 11 | no |
| 19 | `sessions_list` | 25 | 0.31% | 13 | no |
| 20 | `memory_get` | 7 | 0.09% | 6 | no |
| 21 | `whatsapp_login` | 2 | 0.02% | 2 | no |
| 22 | `agents_list` | 2 | 0.02% | 2 | no |
| 23 | `pdf` | 2 | 0.02% | 1 | no |
| 24 | `tts` | 1 | 0.01% | 1 | no |

## 2) Per-Tool L1/L2/L3 Decomposition + Dedup + Risk + Confidence

Confidence rubric used here:
- `high`: large sample and stable control args/action schema.
- `med`: adequate sample but high payload variability and/or mixed schemas.
- `low`: very small sample and/or missing profile data.

| Tool | L1 Node Key | L2 decomposition strategy (families/intents/subtypes) | Optional L3 decomposition (when justified) | Suggested conservative dedup key | Over-fragmentation risk | Confidence |
|---|---|---|---|---|---|---|
| `exec` | `tool.exec` | Intent family from command features: `inspect_fs_text` (1850), `mutating_write` (1505), `network_http` (963), `git_vcs` (293), `runtime_build` (273), `ops_process` (208), `test_validation` (68), `other_shell` (210). | Within each L2 family, split by primary binary (`curl`, `cd`, `python3`, etc.) and timeout bucket. | `exec|sha256(norm_command)|timeout|workdir|background|pty|yieldMs` | high | med |
| `process` | `tool.process` | By `action` enum: `poll` (84.1%), `log` (9.2%), `kill`, `list`, `write`, `submit`, `send-keys`, `wait`. | For `poll`/`log`, split by timeout bucket and pagination (`limit`,`offset`). | `process|action|sessionId|timeout|limit|offset|sha256(data)|sha256(keys)` | low | high |
| `read` | `tool.read` | By path schema + namespace: key variant (`file_path` vs `path`) and namespace (`project_abs`, `openclaw_abs`, `tilde`, other). | Add window subtype (`offset`/`limit` present vs absent). | `read|norm_path|path_key_variant|offset|limit` | med | high |
| `edit` | `tool.edit` | By edit schema variant: snake-case (`old_string/new_string`) vs camel-case (`oldText/newText`) and path namespace. | Add subtype by content delta size bucket (small/medium/large edit). | `edit|norm_path|schema_variant|sha256(old)|sha256(new)` | med | high |
| `write` | `tool.write` | By destination namespace (`project_abs`, `openclaw_abs`, `tmp`) and key variant (`file_path` vs `path`). | Subtype by destination extension (`.md`, `.ts`, `.json`, etc.). | `write|norm_path|path_key_variant|sha256(content)` | med | high |
| `browser` | `tool.browser` | By `action` enum: `act`, `snapshot`, `navigate`, `open`, `start`, `screenshot`, `status`, `tabs`, `stop`. | For `action=act`, split by `request.kind`: `evaluate` (55), `click` (23), `type` (15), `wait` (8), `fill` (6), `press` (3). | `browser|action|targetId|targetUrl|profile|request.kind|sha256(request_payload)|compact|fullPage|interactive` | med | med |
| `web_fetch` | `tool.web_fetch` | By fetch mode: default extraction vs `extractMode=text`; include `maxChars` bucket. | Domain-level subtype if same-domain crawling is needed later. | `web_fetch|canon_url|maxChars|extractMode` | low | high |
| `cron` | `tool.cron` | By `action`: `update`, `add`, `list`, `runs`, `remove`, `run`. For mutating actions, include schedule/payload shape. | For `add/update`, split by schedule kind (`cron`,`at`,`every`) and payload kind (`agentTurn`,`systemEvent`). | `cron|action|jobId|runMode|sha256(norm_job_or_patch)` | med | high |
| `message` | `tool.message` | By delivery modality: text-only vs media vs voice/file attachments; channel explicit vs implicit. | Subtype by account scope (`default`, `kelly`, inferred default). | `message|action|channel|accountId|target_or_to|sha256(message)|sha256(media)|sha256(filePath)|asVoice` | med | high |
| `memory_search` | `tool.memory_search` | By retrieval mode: default params vs bounded (`maxResults`) vs scored (`minScore`). | Query-size bucket (short/medium/long) if needed for routing. | `memory_search|sha256(query)|maxResults|minScore` | low | med |
| `sessions_spawn` | `tool.sessions_spawn` | By spawn mode: minimal spawn (`label+task`) vs model-pinned vs runtime-specific (`runtime`,`agentId`,`cwd`). | Subtype by `runTimeoutSeconds` bucket and model family. | `sessions_spawn|sha256(task)|label|model|mode|cleanup|runtime|agentId|cwd|runTimeoutSeconds|timeoutSeconds` | med | med |
| `web_search` | `tool.web_search` | By locale/filter envelope: default, country-filtered, language-filtered, freshness-filtered. | Subtype by result size (`count`) bucket. | `web_search|sha256(query)|country|language|search_lang|freshness|count` | low | med |
| `gateway` | `tool.gateway` | By `action`: `config.patch`, `config.get`, `config.schema`, `restart`. | For patch actions, split `raw` patch vs structured `patch` payload. | `gateway|action|baseHash|sha256(raw)|sha256(patch)|reason|note` | med | med |
| `subagents` | `tool.subagents` | By `action`: `list`, `steer`, `kill`. | For `steer`, subtype by target form (id/index) and message size bucket. | `subagents|action|target|sha256(message)|recentMinutes` | low | med |
| `image` | `tool.image` | By input cardinality: single image (`image`) vs multi-image (`images`). | Prompt-intent subtype (`describe`, `compare`, `extract`) when classifier is available. | `image|sha256(prompt)|sha256(image_or_images)` | med | med |
| `sessions_send` | `tool.sessions_send` | By destination method: `sessionKey`-targeted vs `agentId`-targeted. | Timeout bucket subtype (`timeoutSeconds`). | `sessions_send|sessionKey|agentId|sha256(message)|timeoutSeconds|label` | low | med |
| `sessions_history` | `tool.sessions_history` | By inclusion mode: with vs without `includeTools`; always keyed by session + limit. | Session class subtype (main/agent/subagent) from `sessionKey` prefix. | `sessions_history|sessionKey|limit|includeTools` | low | med |
| `session_status` | `tool.session_status` | By scope: default status (no args) vs model-scoped status (`model`). | Unknown (insufficient complexity to justify L3 now). | `session_status|model_or_default` | low | med |
| `sessions_list` | `tool.sessions_list` | By filter set: none, `limit`, `activeMinutes`, `kinds`, `messageLimit` combinations. | `kinds` subtype (`dm`,`agent`,`main`,`cron`,`other`,`whatsapp`) when present. | `sessions_list|activeMinutes|limit|messageLimit|sorted(kinds)` | med | med |
| `memory_get` | `tool.memory_get` | By read mode: full-file (`path`) vs ranged (`from`,`lines`). | Path namespace subtype (`memory/` vs absolute). | `memory_get|path|from|lines` | low | low |
| `whatsapp_login` | `tool.whatsapp_login` | `action=start` only observed. | unknown (insufficient data). | `whatsapp_login|action` | high | low |
| `agents_list` | `tool.agents_list` | No-arg listing only observed. | unknown (insufficient data). | `agents_list|static` | high | low |
| `pdf` | `tool.pdf` | Single-turn PDF+prompt extraction pattern observed. | unknown (insufficient data). | `pdf|pdf_path|sha256(prompt)` | high | low |
| `tts` | `tool.tts` | Single text-to-speech call observed. | unknown (insufficient data). | `tts|sha256(text)` | high | low |

## 3) Confidence Notes (sample size + argument stability)
- `high`: `process`, `read`, `edit`, `write`, `web_fetch`, `cron`, `message`.
- `med`: `exec`, `browser`, `memory_search`, `sessions_spawn`, `web_search`, `gateway`, `subagents`, `image`, `sessions_send`, `sessions_history`, `session_status`, `sessions_list`.
- `low`: `memory_get`, `whatsapp_login`, `agents_list`, `pdf`, `tts`.
- Profile data is missing for the long-tail tools (`sessions_send`, `sessions_history`, `session_status`, `sessions_list`, `memory_get`, `whatsapp_login`, `agents_list`, `pdf`, `tts`), so stability confidence is trace-only there.

## 4) Phased Implementation Plan

### Phase A: safest L2 now
- Implement L2 for tools with stable enums/controls and clear gain: `process`, `cron`, `message`, `web_fetch`, `web_search`, `gateway`, `subagents`, `sessions_history`, `session_status`, `sessions_list`, `sessions_send`, `memory_search`, `read`, `write`, `edit`.
- For `browser`, ship only action-level L2 first (defer `request.kind` to Phase B).
- For `exec`, ship only coarse intent family (no aggressive binary-level splits yet).

### Phase B: candidate L3
- Add `browser` L3 by `request.kind` under `action=act`.
- Add `cron` L3 by schedule kind + payload kind.
- Add `sessions_spawn` L3 by timeout/model/runtime envelope.
- Add `read/write/edit` L3 by file extension + edit-size/content-size buckets.
- Add `exec` L3 by primary binary only within high-volume families (especially `inspect_fs_text`, `network_http`, `mutating_write`).

### Phase C: experimental
- NLP-derived intent from free-text payloads (`exec.command`, `message.message`, `sessions_spawn.task`) with quality gates.
- Long-tail tool decomposition (`memory_get`, `whatsapp_login`, `agents_list`, `pdf`, `tts`) only after more traces.
- Dynamic clustering on hashed payload embeddings for unknown/new tool shapes.

## 5) Reasoning Traces: store now vs later

Store now:
- Tool-call envelope: `tool name`, timestamp, session id, outcome (`isError`, exit status where available), latency.
- Normalized argument schema metadata: key presence bitmap, keyset id, low-cardinality control values (action enums, booleans, small ints).
- Hashes for high-entropy payload fields: `sha256` of command/text/query/prompt/message/raw-patch.
- L2 labels and decomposition version id used at ingestion time.

Store later:
- Full assistant reasoning/thinking text.
- Raw full payloads for high-entropy fields (`command`, `message`, `task`, `raw`, long prompts) beyond short retention windows.
- Rich tool-result bodies (only keep sampled failures now).

Rationale:
- Immediate decomposition quality is driven mostly by stable control fields and schema, not full reasoning text.
- Deferring full reasoning/raw payload retention reduces privacy and storage risk while preserving dedup and routing value.

## Go/No-Go for Immediate Implementation
- **Go for Phase A now**.
- Conditions: keep `exec` decomposition coarse, avoid L3 on long-tail tools, and version decomposition rules so reprocessing is possible after more data.
- **No-Go** on immediate Phase B/C until at least one additional trace refresh validates stability (especially for `sessions_*` long tail and `exec` binary-level L3).
