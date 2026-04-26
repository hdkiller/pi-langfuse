# @hdkiller/pi-langfuse

Langfuse observability extension for [Pi Coding Agent](https://github.com/mariozechner/pi-coding-agent).

This repository is maintained as an independent public fork of the original [`pi-langfuse-extension`](https://github.com/saravananravi08/pi-langfuse-extension). It provides deep, production-grade observability for Pi sessions.

## Features

- **Hierarchical Tracing**: Maps user prompts to per-turn spans and nested tool executions.
- **Streaming Generation**: Captures assistant responses (including "thinking" blocks) as they stream.
- **LLM Metadata**: Records model name, provider, token usage, and API costs.
- **Tool Observability**: Detailed logs for every tool call, including arguments, results, and duration.
- **Session Correlation**: Groups all prompts from the same Pi session for easy debugging.
- **System Prompt Capture**: Automatically records the system prompt in trace metadata.
- **Modern Semantics**: Support for `release` and `environment` tagging.
- **Configurable Hygiene**: Fine-grained control over truncation for prompts, tool arguments, and results.

## Quick Install

### Via npm

```bash
pi install npm:@axnic/pi-extension-settings
pi install npm:@hdkiller/pi-langfuse
```

### Via git

```bash
pi install git:github.com/hdkiller/pi-langfuse
```

## Setup

### 1. Configure API Keys

Get your keys from [Langfuse Cloud](https://cloud.langfuse.com) → Settings → API Keys.

Configuration precedence:
1.  `/extensions:settings` (highest)
2.  `config.json`
3.  `LANGFUSE_*` environment variables (lowest)

### 2. Configure in Settings Panel

If `@axnic/pi-extension-settings` is installed, run:

```text
/extensions:settings
```

Then configure these fields under `pi-langfuse`:
- **Enabled**: Global on/off toggle.
- **Public/Secret Key**: Your Langfuse credentials.
- **Base URL**: Defaults to `https://cloud.langfuse.com`.
- **Release/Environment**: Track different versions or contexts.
- **Trace Input/Output Max Chars**: Control data volume sent to Langfuse.
- **Capture Tool Progress**: Whether to record `tool_execution_update` events.

### 3. Quick Toggle

Use the slash command to toggle tracing on the fly:

```text
/langfuse:toggle [on|off]
```

## Architecture

For a deep dive into the tracing model and data flow, see [docs/architecture.md](./docs/architecture.md).

```text
Trace (name: "pi-agent")
└── Span (name: "agent.prompt")
    └── Span (name: "agent.turn")
        ├── Generation (name: "llm-response")
        └── Span (name: "tool:<name>")
```

## Troubleshooting

- **No traces?** Check your API keys and the Pi console for validation warnings.
- **Incomplete traces?** Ensure you are using a modern version of Pi that supports `message_*` events.
- **Large payloads?** Adjust the `max-chars` settings in the settings panel.

## Development

```bash
git clone https://github.com/hdkiller/pi-langfuse.git
cd pi-langfuse
npm install
# Run locally with:
pi -e ./index.ts "hello world"
```

## License

MIT
