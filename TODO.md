# TODO: Improve `pi-langfuse`

Goal: make `pi-langfuse` a first-class, Langfuse-native observability extension for Pi. `pi-otel-telemetry/index.ts` is only a reference for lifecycle coverage and hierarchy patterns — this plan focuses on improving this package itself.

## Objectives

- Preserve the extension's Langfuse-native design
- Improve trace completeness and hierarchy
- Capture more of Pi's lifecycle and tool activity
- Align with current Langfuse SDK and tracing best practices
- Keep configuration and UX simple for Pi users

---

## Phase 0 — Baseline and design constraints

- [x] Document the current event model used by the extension
  - Previous baseline was:
    - `session_start`
    - `model_select`
    - `before_agent_start`
    - `agent_end`
    - `tool_call`
    - `tool_result`
    - `turn_end`
    - `session_shutdown`
  - Current implementation now uses:
    - `session_start`
    - `model_select`
    - `before_agent_start`
    - `agent_start`
    - `turn_start`
    - `tool_call`
    - `tool_execution_start`
    - `tool_execution_update`
    - `tool_result`
    - `tool_execution_end`
    - `turn_end`
    - `agent_end`
    - `session_compact`
    - `session_shutdown`
- [x] Define the target trace model for Pi + Langfuse
- [x] Decide which fields belong in:
  - trace attributes
  - observation metadata
  - usage / cost details
  - tags
- [x] Define a truncation/redaction policy for prompt, tool args, and tool output

### Current implemented model

- One Langfuse **trace per Pi prompt**
- One `agent.prompt` span under the trace
- One `agent.turn` span per turn under `agent.prompt`
- One `tool:<name>` span per tool execution under the current turn
- One `llm-response` generation per assistant turn under the current turn

### Current attribute placement

- **Trace metadata**
  - `cwd`
  - `model`
  - `provider`
  - `sessionReason`
  - aggregate counters (`turns`, `toolCalls`, `toolErrors`, `tokensIn`, `tokensOut`, `cacheRead`, `cacheWrite`, `compactCount`, `durationMs`)
- **Trace attributes / correlation fields**
  - `sessionId`
  - `userId`
  - `tags`
- **Span metadata**
  - turn index/number
  - tool name
  - tool call id
  - args summary
  - duration
  - partial/abandoned markers
- **Generation usage/cost**
  - standard usage: `input`, `output`, `total`
  - usage details: `input_cached_read`, `input_cached_write`
  - cost details when available from provider

### Current truncation policy

- prompt text truncated before sending to Langfuse
- tool args summarized per-tool where possible
- large tool outputs truncated
- structured/non-text values fall back to bounded JSON serialization
- full file contents / fetched content are intentionally not recorded by default

---

## Phase 1 — Fix correctness issues

### High priority bugs

- [x] Fix incorrect `totalTools` reporting
  - Old code used `activeSpans.size` at `agent_end`
  - Replaced by explicit prompt-level counters
- [x] Stop shutting down the Langfuse client on every `agent_end`
  - Client now lives for the Pi session
  - Prompt finalization uses flush, session finalization uses shutdown
- [x] Ensure abandoned/open spans are ended on shutdown or error paths
- [x] Ensure session-scoped state is reset correctly on reload/fork/resume

### State management cleanup

- [x] Replace global singleton-ish per-run state with explicit session/agent/turn state structs
- [x] Track counters explicitly:
  - prompts
  - turns
  - tool calls
  - tool errors
  - tokens in/out
  - cached tokens
- [x] Record timestamps for duration calculation instead of inferring from end-only events

### Notes for next session

- The current implementation still uses module-level state for the *current* prompt/session, but it is now structured (`PromptState`, `TurnState`, `ToolState`) instead of ad-hoc globals.
- There is no multi-prompt concurrent state map yet; this is okay for current Pi extension lifecycle assumptions.

---

## Phase 2 — Improve lifecycle coverage

### Add missing Pi events

- [x] Add `agent_start`
- [x] Add `turn_start`
- [x] Add `tool_execution_start`
- [x] Add `tool_execution_update`
- [x] Add `tool_execution_end`
- [ ] Evaluate adding `message_start`
- [ ] Evaluate adding `message_update`
- [ ] Evaluate adding `message_end`
- [x] Add `session_compact` as a trace event / annotation
- [ ] Evaluate `before_provider_request` for request-size/timing metadata

### Event usage policy

- [x] Use `tool_execution_*` for lifecycle timing and progress
- [x] Keep `tool_call` only if needed for pre-execution argument capture/blocking awareness
- [x] Keep `tool_result` only if needed for final normalized content capture
- [x] Use `turn_start`/`turn_end` to model LLM turns explicitly

### Notes for next session

- `message_update` is the most promising next event to add if we want streaming assistant text or reasoning deltas.
- `before_provider_request` could add payload-size / request-shape metadata, but it should be bounded carefully to avoid noisy traces.

---

## Phase 3 — Introduce a better Langfuse hierarchy

### Target hierarchy

- [ ] Session-level root context for the Pi session
- [x] Per-user-prompt observation/span
- [x] Per-turn child observation/span
- [x] Per-tool child span under the turn
- [x] Per-LLM-generation observation under the turn

### Concrete decisions

- [x] Decide whether each Pi prompt should be:
  - a Langfuse trace
  - or a root observation within a longer session structure
  - **Current decision:** each Pi prompt is its own Langfuse trace
- [x] Ensure tool observations are children of the correct turn
- [x] Ensure generation observations are siblings of tool spans inside the same turn
- [x] Attach session/user/tags early so they propagate consistently

### Open question

- [ ] Re-evaluate whether a future "session root" should exist if we migrate to newer Langfuse SDK patterns or OTEL interop. For now, `sessionId` is the grouping mechanism across prompt traces.

---

## Phase 4 — Improve Langfuse semantics

### Trace/session/user propagation

- [x] Add `sessionId` consistently and early
- [x] Add `userId` support
  - current sources:
    - `PI_LANGFUSE_USER_ID`
    - `LANGFUSE_USER_ID`
    - `USER`
    - `LOGNAME`
- [x] Add trace/session tags
  - implemented:
    - provider
    - model
    - project/repo basename
    - session reason (`startup`, `resume`, `fork`, `reload`) when present
  - not yet implemented:
    - interactive vs non-interactive detection
- [ ] Add release/environment support following Langfuse guidance

### Metadata quality

- [ ] Audit metadata values for SDK compatibility
- [x] Normalize metadata into safe, bounded, meaningful keys
- [x] Avoid stuffing large blobs into metadata
- [x] Move metrics-like values into usage/cost/details where appropriate

### Notes for next session

- Metadata has been improved, but we should still validate against the newer Langfuse SDK guidance after upgrading dependencies.
- `release` and `environment` were intentionally deferred until the SDK upgrade pass.

---

## Phase 5 — Improve LLM generation capture

- [x] Model each assistant turn as a Langfuse generation when usage/model data exists
- [x] Capture model and provider consistently
- [x] Capture prompt input more precisely
  - current user prompt
  - maybe relevant turn context summary if useful
- [x] Capture output more precisely
  - final assistant text
  - optionally structured message summary
- [x] Improve usage details
  - input
  - output
  - total
  - cache read
  - cache write
- [x] Improve cost capture
  - ingest provider cost when present
  - rely on Langfuse inference when cost absent but model is known
- [ ] Decide whether generations should be created on `turn_end` only or partially updated during streaming

### Notes for next session

- Current behavior creates generations on `turn_end` only.
- If we later add `message_update`, we can consider streaming generation updates, but only if the SDK version supports it cleanly and without creating noisy partial observations.

---

## Phase 6 — Improve tool observability

- [x] Capture tool start/end timestamps and duration
- [x] Record tool error status explicitly
- [x] Capture tool args with per-tool summarization/redaction rules
- [x] Capture tool output with per-tool summarization/truncation rules
- [x] Capture partial progress from `tool_execution_update`
- [x] Preserve structured result details when useful
- [ ] Handle non-text tool outputs safely
  - images
  - structured JSON-ish details
  - binary/file references
- [ ] Decide how to represent blocked or cancelled tool calls

### Suggested per-tool policy

- [x] `bash`: keep command summary, duration, failure, truncated output
- [x] `read`: keep path and range, not full file contents unless useful
- [x] `write` / `edit`: keep path and patch summary, avoid huge payloads
- [x] `web_search`, `fetch_content`, `code_search`: keep query/URL summary, not full fetched content by default
- [ ] `ask_user`: keep question summary and outcome state, avoid sensitive user text leakage when necessary

### Notes for next session

- `summarizeToolResult()` still mostly favors text extraction + bounded JSON fallback.
- Image outputs and richer tool-specific structured summaries are still open work.
- Blocked/cancelled tool-call behavior has not been modeled separately yet.

---

## Phase 7 — Error, cancellation, and shutdown behavior

- [x] Record failed tool executions with explicit status and error metadata
- [x] Record incomplete prompt runs when the session stops mid-agent
- [ ] Handle cancellation/interruption cleanly
- [x] Flush on `session_shutdown`
- [x] Consider explicit flush after each completed prompt in non-interactive/short-lived contexts
  - current behavior flushes on prompt finalization as well
- [x] Ensure config reload performs safe client replacement without losing queued data

### Notes for next session

- Cancellation/interruption semantics should be verified against real Pi cancellation behavior.
- We currently treat abandoned spans conservatively during cleanup, but not all interruption reasons are classified distinctly.

---

## Phase 8 — SDK modernization

- [x] Upgrade `langfuse` dependency from `^3.0.0` to the current recommended version
- [x] Review current Langfuse JS/TS migration guidance before code changes
- [ ] Evaluate moving to newer patterns such as:
  - `propagateAttributes()`
  - newer trace/observation APIs
  - environment/release env vars
- [ ] Re-check metadata requirements after upgrade
- [ ] Validate no deprecated APIs remain in use

### Notes for next session

- This remains an important implementation track.
- The dependency range now targets the current 3.x release line, but the implementation should still be validated against the latest Langfuse migration target.
- Start here next: run type checks against the upgraded dependency, then adapt metadata / trace APIs as needed.

---

## Phase 9 — Configuration and settings improvements

- [x] Keep current settings integration working
- [x] Add optional settings for observability behavior
  - trace input/output limits
  - tool arg/output truncation limits
  - enable/disable tool progress capture
  - enable/disable message streaming capture
  - optional user ID override
  - optional default tags
- [x] Decide whether to support `LANGFUSE_HOST` in addition to `LANGFUSE_BASE_URL`
- [x] Add validation and better diagnostics for invalid config

### Notes for next session

- `LANGFUSE_HOST` support has been added in `config.ts`.
- Settings now include truncation limits, default tags, user ID override, and tool-progress capture toggles.
- `capture-message-updates` is stored in config/settings now, but actual `message_update` event wiring is still future work.

---

## Phase 10 — Testing and verification

- [ ] Manual test: single prompt, no tools
- [ ] Manual test: prompt with multiple tools
- [ ] Manual test: parallel tools
- [ ] Manual test: tool error
- [ ] Manual test: interrupted/cancelled run
- [ ] Manual test: session reload
- [ ] Manual test: session fork/resume
- [ ] Manual test: config change while running
- [ ] Manual test: large tool output truncation
- [ ] Verify hierarchy in Langfuse UI
- [ ] Verify sessions view groups traces correctly
- [ ] Verify user/tag filtering works
- [ ] Verify token/cost charts look correct

---

## Proposed implementation order

### Milestone 1 — Stabilize current extension
- [x] Fix counters and state bugs
- [x] Keep client alive until `session_shutdown`
- [x] Add safe flush/shutdown handling

### Milestone 2 — Add richer lifecycle coverage
- [x] Add `turn_start`
- [x] Add `tool_execution_start/update/end`
- [x] Add duration/error/progress capture

### Milestone 3 — Reshape hierarchy
- [x] Introduce explicit prompt/turn/tool/generation hierarchy
- [x] Add session/user/tags propagation

### Milestone 4 — Modernize Langfuse usage
- [ ] Upgrade SDK
- [ ] Adopt newer attribute propagation patterns if beneficial
- [x] Normalize metadata/usage/cost modeling

### Milestone 5 — Polish
- [x] README updates
- [x] config/settings additions
- [ ] optional tests/examples

---

## Current status summary for a new session

Implemented in this session:

- refactored `index.ts` from flat tracing to prompt/turn/tool/generation hierarchy
- added prompt finalization + cleanup logic for abandoned turns/tools
- stopped client shutdown on every prompt; now flushes/finalizes and shuts down at session end
- added `flushClient()` and richer Langfuse typings in `langfuse-client.ts`
- added `LANGFUSE_HOST` fallback in `config.ts`
- added configurable truncation/tag/user/progress settings plus config validation warnings
- updated `README.md` to describe the richer integration

Highest-priority remaining work:

1. validate/adapt the implementation to the latest Langfuse API expectations
2. consider `message_update` for streaming assistant generation updates
3. verify cancellation semantics and add tests/examples
4. decide whether to implement streaming assistant `message_update` capture now that config storage is ready
5. add tests/examples and verify real Langfuse UI behavior end-to-end

Useful files to start with next time:

- `pi-langfuse-extension/index.ts`
- `pi-langfuse-extension/langfuse-client.ts`
- `pi-langfuse-extension/config.ts`
- `pi-langfuse-extension/README.md`

Repository/package identity:
- GitHub repo target: `hdkiller/pi-langfuse`
- npm package target: `@hdkiller/pi-langfuse`
- settings namespace: `pi-langfuse`

---

## Notes from current review

- `pi-otel-telemetry/index.ts` is a good reference for lifecycle completeness and hierarchy, but this extension should remain Langfuse-native.
- The original `pi-langfuse-extension/index.ts` was functional but too flat and missed important Pi lifecycle events.
- The current implementation likely under-reports tool totals and does unnecessary client shutdown/recreation.
- Langfuse docs strongly suggest early propagation of `sessionId`, `userId`, and `tags` for accurate grouping and filtering.
- Pi is a long-running app, so the Langfuse client should generally stay alive through the session and flush on shutdown.
