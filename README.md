# @hdkiller/pi-langfuse

Langfuse observability extension for [Pi Coding Agent](https://github.com/mariozechner/pi-coding-agent).

This repository is maintained as an independent public fork of the original [`pi-langfuse-extension`](https://github.com/saravananravi08/pi-langfuse-extension) by **Saravanan Ravi**. It also builds on tracing and lifecycle ideas from [`pi-otel-telemetry`](https://github.com/mprokopov/pi-otel-telemetry) by **Maksym Prokopov**.

The original extension was a solid minimal starting point. This fork has grown into a more comprehensive Langfuse integration with richer Pi lifecycle coverage, better trace hierarchy, safer client lifecycle handling, and more detailed tool/generation observability. Because that scope is now broader and more complex than the original extension, it is maintained independently as `pi-langfuse`.

## Attribution

- Original `pi-langfuse-extension`: **Saravanan Ravi** (`saravananravi08`)
- `pi-otel-telemetry` reference/inspiration: **Maksym Prokopov** (`mprokopov`)

## Why this fork exists

Compared to the original `pi-langfuse-extension`, this fork currently improves:

- **Prompt + turn hierarchy** instead of mostly flat trace data
- **Tool execution spans** tied to Pi lifecycle events
- **Configurable partial tool progress capture** via `tool_execution_update`
- **Tool duration and error tracking**
- **Assistant-turn generations** with usage and cost details
- **Session/user/tag propagation** for better filtering in Langfuse
- **Configurable truncation controls** for prompt/tool input and output capture
- **Safer client lifecycle**
  - no shutdown on every prompt
  - explicit flush/finalization on prompt/session end
  - cleanup of abandoned tool/turn spans
- **Better trace metadata** for project/model/provider/session context
- **Support for `LANGFUSE_HOST`** in addition to `LANGFUSE_BASE_URL`
- **Better config diagnostics** for missing keys and invalid base URLs

## Quick Install

### Via npm

```bash
pi install npm:@axnic/pi-extension-settings
pi install npm:@hdkiller/pi-langfuse
```

The settings panel extension provides `/extensions:settings`, where this extension exposes Langfuse settings.

### Via git

```bash
pi install npm:@axnic/pi-extension-settings
pi install git:github.com/hdkiller/pi-langfuse
```

## Setup

### 1. Configure API Keys

Get your keys from [Langfuse Cloud](https://cloud.langfuse.com) → Settings → API Keys.

Configuration precedence:

1. `/extensions:settings`
2. `config.json`
3. `LANGFUSE_*` environment variables

Create `config.json` in the extension directory:

```json
{
  "enabled": false,
  "publicKey": "pk-lf-xxxx",
  "secretKey": "sk-lf-xxxx",
  "host": "https://cloud.langfuse.com",
  "userId": "",
  "defaultTags": ["team:platform", "env:local"],
  "traceInputMaxChars": 2000,
  "traceOutputMaxChars": 2000,
  "toolArgsMaxChars": 500,
  "toolOutputMaxChars": 2000,
  "captureToolProgress": true,
  "captureMessageUpdates": false
}
```

Set `enabled` to `false` if you want Pi to start without tracing, then enable it later in the same session with `/langfuse:toggle`.

If `config.json` does not exist, the extension falls back to these environment variables:

```bash
export LANGFUSE_PUBLIC_KEY="pk-lf-xxxx"
export LANGFUSE_SECRET_KEY="sk-lf-xxxx"
export LANGFUSE_BASE_URL="https://cloud.langfuse.com"
# also supported:
export LANGFUSE_HOST="https://cloud.langfuse.com"
# optional user correlation override:
export PI_LANGFUSE_USER_ID="your-user-id"
# optional comma-separated tags applied to every trace:
export PI_LANGFUSE_TAGS="team:platform,env:local"
```

For npm installs, the package is typically located at:

```bash
~/.pi/agent/npm/@hdkiller/pi-langfuse/index.ts
```

### 2. Or configure in the settings panel

If `@axnic/pi-extension-settings` is installed, open:

```text
/extensions:settings
```

Then configure these fields under `pi-langfuse`:

- `enabled`
- `public-key`
- `secret-key`
- `base-url`
- `user-id`
- `default-tags`
- `trace-input-max-chars`
- `trace-output-max-chars`
- `tool-args-max-chars`
- `tool-output-max-chars`
- `capture-tool-progress`
- `capture-message-updates` *(reserved for future streaming message capture)*

The `enabled` value in `/extensions:settings` overrides `config.json` for future sessions until you change it again.

Empty values in the panel show the live effective fallback currently resolved from `config.json`, `LANGFUSE_*`, or built-in defaults.

### 3. Toggle tracing quickly

Use the slash command:

```text
/langfuse:toggle
```

Or force a specific state:

```text
/langfuse:toggle on
/langfuse:toggle off
```

### 4. Run pi

After installation, Pi auto-loads the extension. Just run:

```bash
pi "your prompt"
```

Or use `-e` for a specific session:

```bash
pi -e npm:@hdkiller/pi-langfuse "your prompt"
```

## Features

| Feature | Description |
|---------|-------------|
| **Trace Input/Output** | Captures user prompts and assistant responses |
| **Prompt + Turn Hierarchy** | Records prompt-level and per-turn observations for Pi agent loops |
| **Tool Execution Spans** | Records tool calls with args summary, partial progress, results, duration, and errors |
| **Session Tracking** | Groups traces by Pi session ID |
| **Model Info** | Records model name and provider |
| **Token Usage** | Tracks input/output/cache tokens per generation |
| **Cost Tracking** | Records API costs when available |
| **Tags + User Context** | Adds Pi/project/provider/model/session tags plus optional default tags and user ID override |
| **Configurable Truncation** | Controls prompt/tool input and output capture limits |
| **Langfuse Sessions** | Traces grouped by conversation session |
| **Settings Panel Integration** | Exposes live-effective Langfuse settings in `/extensions:settings` with diagnostics-friendly defaults |
| **Quick Toggle Command** | Toggle tracing with `/langfuse:toggle` |

## Manual Installation

```bash
# Clone repo
git clone https://github.com/hdkiller/pi-langfuse.git
cd pi-langfuse

# Install dependencies
npm install

# Optional: install settings panel support in pi
pi install npm:@axnic/pi-extension-settings

# Configure with file (optional)
cp config.example.json config.json
# Edit config.json with your Langfuse API keys

# Or configure with environment variables instead
export LANGFUSE_PUBLIC_KEY="pk-lf-xxxx"
export LANGFUSE_SECRET_KEY="sk-lf-xxxx"
export LANGFUSE_BASE_URL="https://cloud.langfuse.com"
export PI_LANGFUSE_USER_ID="your-user-id" # optional

# Run with extension
pi -e ./index.ts "your prompt"
```

## File Structure

```text
pi-langfuse/
├── index.ts
├── settings.ts
├── config.ts
├── langfuse-client.ts
├── config.example.json
├── docs/
│   └── extension-settings-best-practices.md
└── README.md
```

## Dependencies

- [langfuse](https://www.npmjs.com/package/langfuse) - Langfuse SDK
- [@axnic/pi-extension-settings](https://github.com/axnic/pi-extension-settings) - Optional settings panel extension
- [@mariozechner/pi-coding-agent](https://www.npmjs.com/package/@mariozechner/pi-coding-agent) - Pi extension API

## Publishing notes

This package is prepared to publish as:

- npm package: `@hdkiller/pi-langfuse`
- GitHub repository: `github.com/hdkiller/pi-langfuse`

Already updated:

- `package.json`
  - package name
  - version
  - repository/homepage/bugs
  - `publishConfig.access = "public"`
- `package-lock.json` root package metadata
- install instructions in `README.md`
- settings namespace updated to `pi-langfuse`

Before publishing, you should also verify:

- npm account has access to publish the `@hdkiller` scope
- `npm login`
- `npm publish --access public`
- screenshot/image URL is valid if you want to keep `pi.image`
- dependency versions are the ones you want to support publicly
- README examples and package paths match the final repo/package layout

## Troubleshooting

**No traces appearing?**
- Verify API keys are correct in `/extensions:settings`, `config.json`, or `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`
- Verify `LANGFUSE_BASE_URL`, `LANGFUSE_HOST`, or `base-url` if you are not using Langfuse Cloud
- Check the Pi console for config warnings such as missing keys or malformed base URLs
- Check Langfuse project is active
- Ensure API keys have write permissions

**Extension not loading?**
- Run `pi list` to check installed packages
- Make sure `@axnic/pi-extension-settings` is installed if you want the settings panel integration
- Try `pi reload` to refresh

**Settings integration behaving oddly?**
- This extension uses the direct event protocol instead of the SDK runtime
- See `docs/extension-settings-best-practices.md`

## License

MIT
