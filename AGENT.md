# @hdkiller/pi-langfuse - Agent Documentation

This file provides critical context for AI agents working on the `pi-langfuse` extension. It describes the project's purpose, architecture, and developer workflows.

## Project Identity

- **NPM Package**: `@hdkiller/pi-langfuse`
- **GitHub**: `hdkiller/pi-langfuse`
- **Settings Namespace**: `pi-langfuse`
- **Purpose**: Langfuse-native observability for Pi Coding Agent.

## Core Architecture

The extension follows a hierarchical tracing model that maps Pi's agent loop to Langfuse observations:

1.  **Trace**: One trace per user prompt. Correlated via `sessionId`.
2.  **Span (`agent.prompt`)**: Covers the entire agentic loop for that prompt.
3.  **Span (`agent.turn`)**: One per LLM turn (reasoning/tool-calling).
4.  **Span (`tool:<name>`)**: Nested under the turn, captures execution details.
5.  **Generation (`llm-response`)**: Nested under the turn, captures LLM input/output/usage.

### State Management

`index.ts` maintains a module-level `promptState` which is reset on `before_agent_start`. It uses:
- `PromptState`: Root state for the current prompt.
- `TurnState`: Map-based state for active turns (handles concurrency/parallelism).
- `ToolState`: Map-based state for active tool executions.

## Developer Workflows

### Setup for Development

1.  Install dependencies: `npm install`
2.  Install settings helper: `pi install npm:@axnic/pi-extension-settings`
3.  Run locally: `pi -e ./index.ts "your prompt"`

### Code Style & Hygiene

- **Indentation**: Tabs (standard for this project)
- **Formatting**: Use `npm run lint` if available (check Biome/ESLint)
- **Validation**: Run `npx tsc --noEmit` to check types (requires `typescript` in `node_modules`).

### Common Tasks

- **Adding a new event**: Listen to `pi.on("event_name")` in `index.ts`.
- **Modifying metadata**: Update `resolveConfig` in `config.ts` and ensure it propagates to trace/spans.
- **Updating settings**: Add to `SettingsValues` in `settings.ts` and update `createSettingsNodes`.

## Critical Files

- `index.ts`: Main entry point, event listeners, and tracing logic.
- `config.ts`: Configuration resolution (Settings -> File -> Env -> Defaults).
- `settings.ts`: Integration with `@axnic/pi-extension-settings`.
- `langfuse-client.ts`: Langfuse SDK wrapper and type definitions.

## Contextual Precedence

1.  `AGENT.md` (this file)
2.  `TODO.md` (roadmap and current status)
3.  `README.md` (user-facing documentation)
