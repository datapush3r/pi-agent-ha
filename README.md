# Pi Agent Terminal for Home Assistant

A Home Assistant add-on that runs the [pi coding agent](https://pi.dev/) in a browser-based terminal, right inside your dashboard. It ships the `ha` CLI for managing Home Assistant, git, and ripgrep — keeps your session alive across restarts with tmux, and opens in your `/config` directory.

Inspired by [esjavadex/claude-code-ha](https://github.com/esjavadex/claude-code-ha) (MIT).

## Install

1. **Settings → Add-ons → Add-on Store**
2. Top-right menu (⋮) → **Repositories**
3. Add `https://github.com/datapush3r/pi-agent-ha` and click **Add**
4. Install **Pi Agent Terminal**, start it, and open the panel from the sidebar

## Options

| Option | Default | Description |
| --- | --- | --- |
| `auto_launch_pi` | `true` | Launch pi as soon as the terminal opens. Set `false` to get a plain shell and start pi yourself. |
| `tmux_mouse` | `false` | Enable tmux mouse capture. Off by default so browser copy/paste (e.g. pasting `/login` codes) keeps working. |
| `provider` | *(empty)* | pi provider name passed as `--provider` (empty = pi's default). |
| `model` | *(empty)* | pi model pattern or ID passed as `--model`, e.g. `anthropic/claude-sonnet-4-5`. |
| `api_key` | *(empty)* | Provider API key. When set, it is exported as the env var named by `api_key_env`. Leave empty to use interactive `/login` in the terminal. |
| `api_key_env` | `ANTHROPIC_API_KEY` | Env var name used for `api_key` (e.g. `OPENAI_API_KEY` for OpenAI). |

## Authentication

Two ways, both work:

- **Add-on option:** set `api_key` (and `api_key_env` if your provider isn't Anthropic). The key is exported into the container at startup.
- **Interactive:** leave `api_key` empty and run `/login` inside the pi terminal. Auth state persists in `/data` across restarts.

## Persistence

- pi settings, auth, and session history live in `/data/home/.pi/agent` (survives add-on updates and HA restarts).
- The pi session runs in a **persistent tmux session** — closing the browser tab or restarting Home Assistant does not kill it; reopening reattaches to the same one.

## Local LLMs (Ollama / LM Studio / vLLM / any OpenAI-compatible server)

custom providers are defined in pi's `models.json`. Drop a file at **`/config/pi-agent-ha/models.json`** (editable in the HA file editor) and the add-on syncs it into pi's state dir on start. pi also reloads the file every time you open `/model`, so edits apply **without restarting** the add-on.

Example `/config/pi-agent-ha/models.json`:

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

Notes:

- `apiKey` may be a dummy value for keyless servers (Ollama ignores it) — pi requires *some* value before the model appears in `/model`.
- **Networking:** the add-on is a container, so `localhost`/`127.0.0.1` points at the add-on itself, not the HA host. Use your LLM server's LAN IP, or a Docker network alias if it runs in Docker on a shared network.
- Some OpenAI-compatible servers need `"compat": { "supportsDeveloperRole": false, "supportsReasoningEffort": false }` at the provider level.
- Reasoning/thinking models (ones returning a `reasoning_content` field) need `"reasoning": true` on the model entry so pi parses the thinking tokens instead of waiting for normal content.
- The synced file lives at `/data/home/.pi/agent/models.json`; editing it there directly also works (a restart won't clobber it unless the `/config` copy is newer).

## Architecture support

`amd64`, `aarch64`, `armv7` (Alpine 3.21 base images).

## License

MIT
