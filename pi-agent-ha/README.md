# Pi Agent Terminal for Home Assistant

A Home Assistant add-on that runs the [pi coding agent](https://pi.dev/) in a browser-based terminal, right inside your dashboard. It ships the `ha` CLI for managing Home Assistant, git, and ripgrep — keeps your session alive across restarts with tmux, and opens in your `/config` directory.

Inspired by [esjavadex/claude-code-ha](https://github.com/esjavadex/claude-code-ha) (MIT).

## Install

1. **Settings → Add-ons → Add-on Store**
2. Top-right menu (⋮) → **Repositories**
3. Add `https://github.com/datapush3r/pi-agent-ha` and click **Add**
4. Install **Pi Agent Terminal**, start it, and open the panel from the sidebar

The container image is pre-built for each supported architecture and hosted on GitHub Container Registry — installing and updating pull the image instead of building it on your Home Assistant box.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `auto_launch_pi` | `true` | Launch pi as soon as the terminal opens. Set `false` to get a plain shell and start pi yourself. |
| `tmux_mouse` | `false` | Enable tmux mouse capture. Off by default so browser copy/paste (e.g. pasting `/login` codes) keeps working. |
| `provider` | *(empty)* | pi provider name passed as `--provider` (empty = pi's default). |
| `model` | *(empty)* | pi model pattern or ID passed as `--model`, e.g. `anthropic/claude-sonnet-4-5`. |
| `api_key` | *(empty)* | Provider API key. When set, it is exported as the env var named by `api_key_env`. Leave empty to use interactive `/login` in the terminal. |
| `api_key_env` | `ANTHROPIC_API_KEY` | Env var name used for `api_key` (e.g. `OPENAI_API_KEY` for OpenAI). |
| `local_base_url` | *(empty)* | Base URL of a local OpenAI-compatible LLM server, e.g. `http://192.168.1.10:8080/v1`. When set, `models.json` is generated from the `local_*` options — no file editing needed. |
| `local_model` | *(empty)* | Model id of the local LLM, e.g. `qwen3.8-27b`. Used as `--model` when `model` is empty. |
| `local_provider_name` | `ninfer` | Provider key in the generated `models.json`. Used as `--provider` when `provider` is empty. |
| `local_api` | `openai-completions` | API dialect of the server. |
| `local_api_key` | *(empty)* | API key for the server; a dummy value is used when empty (keyless servers). |
| `local_reasoning` | `true` | Set `false` if the model is not a reasoning model. |
| `local_context_window` | `240000` | Context window of the local model, in tokens. |
| `local_max_tokens` | `8192` | Max output tokens of the local model. |
| `ha_mcp_url` | *(empty)* | MCP server URL pi connects to for Home Assistant control. Set it to the [ha-mcp app's](https://github.com/homeassistant-ai/ha-mcp) MCP URL (from its Logs tab) to enable; empty = no HA tools. |
| `ha_mcp_token` | *(empty)* | Optional Bearer token, only if the MCP endpoint requires one (e.g. HA's built-in `/api/mcp`). The ha-mcp app's secret-URL endpoint does not. |

## Authentication

Two ways, both work:

- **Add-on option:** set `api_key` (and `api_key_env` if your provider isn't Anthropic). The key is exported into the container at startup.
- **Interactive:** leave `api_key` empty and run `/login` inside the pi terminal. Auth state persists in `/data` across restarts.

## Persistence

- pi settings, auth, and session history live in `/data/home/.pi/agent` (survives add-on updates and HA restarts).
- The pi session runs in a **persistent tmux session** — closing the browser tab or restarting Home Assistant does not kill it; reopening reattaches to the same one.

## Local LLMs (Ollama / LM Studio / vLLM / any OpenAI-compatible server)

**Easiest: the add-on options.** Set `local_base_url` and `local_model` — `models.json` is generated for you at startup, no file editing. Adjust `local_reasoning`, `local_context_window`, and `local_max_tokens` to match your model. When `local_base_url` is set, `provider`/`model` fall back to the local LLM (`local_provider_name`/`local_model`) automatically, so a local-only setup needs just those two fields. To launch a cloud model instead, set `provider`/`model` explicitly (or switch anytime with `/model` in the terminal).

Example: local LLM at `192.168.1.10:8080`, model `qwen3.8-27b` (240k context, reasoning):

| Option | Value |
| --- | --- |
| `local_base_url` | `http://192.168.1.10:8080/v1` |
| `local_model` | `qwen3.8-27b` |

Notes:

- **Networking:** the add-on is a container, so `localhost`/`127.0.0.1` points at the add-on itself, not the HA host. Use your LLM server's LAN IP, or a Docker network alias if it runs in Docker on a shared network.
- Reasoning/thinking models (ones returning a `reasoning_content` field) need `local_reasoning: true` so pi parses the thinking tokens instead of waiting for normal content.
- The generated file is rewritten on every add-on start at `/data/home/.pi/agent/models.json` — edit the options, not the file.

### Advanced: hand-written models.json

Prefer full control (multiple models, `compat` flags, custom fields)? Drop a file at **`/config/pi-agent-ha/models.json`** (editable in the HA file editor) and leave `local_base_url` empty — the UI options take precedence when set. The add-on syncs the file into pi's state dir on start (only when it's newer), and pi reloads it every time you open `/model`, so edits apply **without restarting**.

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://192.168.1.50:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "qwen2.5-coder:32b" }
      ]
    }
  }
}
```

Then set the add-on option `provider` to the provider key (e.g. `ollama`) and/or pick the model with `/model` in the terminal.

- `apiKey` may be a dummy value for keyless servers (Ollama ignores it) — pi requires *some* value before the model appears in `/model`.
- Some OpenAI-compatible servers need `"compat": { "supportsDeveloperRole": false, "supportsReasoningEffort": false }` at the provider level.

## Home Assistant control (ha-mcp)

pi can read and control Home Assistant through a **Model Context Protocol (MCP)
server**, exposed to the agent as two tools:

- `ha_tools` — list the available MCP tools, each with a description and input schema.
- `ha_call` — call one of those tools by name with JSON arguments.

**Intended backend: the [homeassistant-ai ha-mcp server](https://github.com/homeassistant-ai/ha-mcp).**
It is a full-featured HA server — beyond controlling exposed entities it can build and edit
automations, dashboards, and scripts; debug automations from traces; read history and logs;
and manage helpers, areas, zones, labels, HACS, backups, and the device/entity registry.

### Connect pi to the ha-mcp app

1. **Add the repo** (once): Settings → Apps → ⋮ → Repositories → add
   `https://github.com/homeassistant-ai/ha-mcp`.
2. **Install** the **Home Assistant MCP Server** app and start it.
3. Open its **Logs** tab and copy the **MCP URL** it prints.
4. Paste that URL into this add-on's `ha_mcp_url` option and restart pi-agent-ha.

pi then lists the ha-mcp tools via `ha_tools` and drives Home Assistant via `ha_call`.
Leave `ha_mcp_url` empty to disable HA control — the extension is a graceful no-op, so
pi still runs normally.

> The built-in HA MCP server also works: point `ha_mcp_url` at
> `http://homeassistant:8123/api/mcp` and set `ha_mcp_token` to an HA long-lived
> access token. The ha-mcp app is the more capable, recommended backend.

## Architecture support

`amd64`, `aarch64` (pre-built images on GHCR, `ghcr.io/home-assistant/base` multi-arch base).

## License

MIT
