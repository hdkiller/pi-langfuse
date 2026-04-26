# @ravan08/pi-langfuse

Langfuse observability extension for [Pi Coding Agent](https://github.com/mariozechner/pi-coding-agent). Sends traces to [Langfuse](https://langfuse.com) for monitoring tokens, costs, latency, and tool calls.

## Quick Install

### Via npm (recommended)
```bash
pi install npm:@axnic/pi-extension-settings
pi install npm:@ravan08/pi-langfuse
```

The settings panel extension provides `/extensions:settings`, where this extension exposes Langfuse settings.

### Via git
```bash
pi install npm:@axnic/pi-extension-settings
pi install git:github.com/saravananravi08/pi-langfuse-extension
```

## Setup

### 1. Configure API Keys

Get your keys from [Langfuse Cloud](https://cloud.langfuse.com) → Settings → API Keys.

You can configure the extension in three ways, with this precedence:
1. `/extensions:settings`
2. `config.json`
3. `LANGFUSE_*` environment variables

Create `config.json` in the extension directory:

```json
{
  "enabled": false,
  "publicKey": "pk-lf-xxxx",
  "secretKey": "sk-lf-xxxx",
  "host": "https://cloud.langfuse.com"
}
```

Set `enabled` to `false` if you want Pi to start without tracing, then enable it later in the same session with `/langfuse:toggle`.

If `config.json` does not exist, the extension falls back to these environment variables:

```bash
export LANGFUSE_PUBLIC_KEY="pk-lf-xxxx"
export LANGFUSE_SECRET_KEY="sk-lf-xxxx"
export LANGFUSE_BASE_URL="https://cloud.langfuse.com"
```

For npm install, find the extension at:
```bash
~/.pi/agent/npm/@ravan08/pi-langfuse/index.ts
```

### 2. Or configure in the settings panel

If `@axnic/pi-extension-settings` is installed, open:

```text
/extensions:settings
```

Then configure these fields under `pi-langfuse-extension`:
- `enabled`
- `public-key`
- `secret-key`
- `base-url`

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

After installation, pi auto-loads the extension. Just run:

```bash
pi "your prompt"
```

Or use `-e` for specific session:
```bash
pi -e npm:@ravan08/pi-langfuse "your prompt"
```

## Features

| Feature | Description |
|---------|-------------|
| **Trace Input/Output** | Captures user prompts and assistant responses |
| **Session Tracking** | Groups traces by pi session ID |
| **Model Info** | Records model name and provider |
| **Token Usage** | Tracks input/output tokens per generation |
| **Cost Tracking** | Records API costs |
| **Tool Call Spans** | Records tool calls with parameters and results |
| **Langfuse Sessions** | Traces grouped by conversation session |
| **Settings Panel Integration** | Exposes live-effective Langfuse settings in `/extensions:settings` |
| **Quick Toggle Command** | Toggle tracing with `/langfuse:toggle` |

## Manual Installation (from source)

```bash
# Clone repo
git clone https://github.com/saravananravi08/pi-langfuse-extension.git
cd pi-langfuse-extension

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

# Run with extension
pi -e ./index.ts "your prompt"
```

## File Structure

```text
pi-langfuse-extension/
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

## Troubleshooting

**No traces appearing?**
- Verify API keys are correct in `/extensions:settings`, `config.json`, or `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`
- Verify `LANGFUSE_BASE_URL` or `base-url` if you are not using Langfuse Cloud
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
