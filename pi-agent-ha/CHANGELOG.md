# Changelog

All notable changes to the **Pi Agent Terminal** add-on. Newest first.

## 1.5.1 — 2026-09-03

- **Docs: expanded the skill and ha-mcp documentation.** New standalone guide
  [`HA-MCP.md`](HA-MCP.md) for the optional Home Assistant control
  integration — backends in detail (ha-mcp app and HA's built-in MCP server),
  `ha_tools`/`ha_call` tool reference, behavior notes, options, and a
  troubleshooting table. The README's *Home Assistant best-practices skill*
  section now documents what the skill contains (decision workflow,
  anti-pattern table, 14 reference docs), how pi loads it, and how to force
  it with `/skill:home-assistant-best-practices`. No image or behavior change.

## 1.5.0 — 2026-09-03

- **Home Assistant best-practices skill.** On every start the add-on syncs the [`home-assistant-best-practices`](https://github.com/homeassistant-ai/skills) agent skill from the [homeassistant-ai/skills](https://github.com/homeassistant-ai/skills) repo into pi's global skills dir (`/data/home/.pi/agent/skills/`). pi implements the [Agent Skills standard](https://agentskills.io) natively, so the skill works with no setup and no new options: its short description is always in pi's context, and the full guidance (native triggers/conditions over Jinja, helper selection, automation modes, dashboards, safe refactoring) loads on demand whenever pi touches your automations, scripts, scenes, or dashboards.
- The skill is fetched from upstream `main` at startup, so fixes flow through without an image rebuild or version bump. A failed download or a repo layout change keeps the previously synced copy — the old copy is only replaced after the new `SKILL.md` is verified.
- **`ha_tools` / `ha_call` output is hidden by default.** HA tool results no longer take terminal space — the TUI tool blocks render empty (self-shell rendering). Press `ctrl+o` (pi's *expand tool output* keybinding) to show the full output of the tool calls. This is display-only: the model always receives the full result.

## 1.4.0 — 2026-09-02

- **Pivoted the Home Assistant backend to the [homeassistant-ai ha-mcp server](https://github.com/homeassistant-ai/ha-mcp).** The `ha-mcp.ts` extension is now a general MCP *Streamable HTTP* client: point `ha_mcp_url` at any MCP server and pi gets its tools (`ha_tools` / `ha_call`). The intended backend is the official **Home Assistant MCP Server** app — beyond controlling entities it can build/edit automations, dashboards, and scripts; debug from traces; read history and logs; and manage helpers, areas, zones, labels, HACS, backups, and the device/entity registry.
- **`ha_mcp_url` is now the on-switch (was `ha_mcp_token`).** The extension is a graceful no-op when `ha_mcp_url` is empty (the new default) — set it to the MCP server URL to enable. `ha_mcp_token` is now an *optional* Bearer token, only needed if the endpoint requires one (e.g. HA's built-in `/api/mcp`); the ha-mcp app's secret-URL endpoint does not.
- To connect: install the ha-mcp app, copy its MCP URL (shown in that app's **Logs** tab) into the `ha_mcp_url` option, and restart. pi then lists the ha-mcp tools via `ha_tools` and drives HA via `ha_call`.

## 1.3.0 — 2026-09-02

- **Control Home Assistant from pi via the built-in MCP server.** A new pi
  extension (`ha-mcp.ts`) connects pi to HA's MCP server (MCP *Streamable HTTP*
  at `http://homeassistant:8123/api/mcp`) and exposes two tools:
  - `ha_tools` — list the Home Assistant tools HA exposes, with each one's
    description and input schema.
  - `ha_call` — call one of those tools by name with JSON arguments.
- New add-on options: `ha_mcp_url` (the MCP endpoint) and `ha_mcp_token` (an HA
  **long-lived access token**, used as the Bearer credential). The bridge
  activates whenever `ha_mcp_token` is set; leave it empty and the extension is
  a graceful no-op, so a missing token never breaks pi startup.
- pi ships no built-in MCP client, so this is delivered as a pi extension baked
  into the image and copied into pi's global extensions dir at startup (stays
  current across updates).

## 1.2.3 — 2026-09-02

- **README and changelog now render in the Add-on Store.** Moved `README.md`
  and `CHANGELOG.md` into the add-on directory (`pi-agent-ha/`) so the
  Supervisor serves them: the README is shown as the store's long description
  and the changelog is available from the store's changelog view. The repo-root
  `README.md` is now a short landing page pointing at the full docs.
- Version bump (no image/behavior change — the docs come from the store, not
  the container image).

## 1.2.2 — 2026-09-02

- **Fixed: the add-on did not appear in the Add-on Store.** The manifest's
  `image` field carried a `:latest` tag, which the Supervisor rejects
  ("Docker image must not contain a tag") — so the repo cloned fine but the
  add-on was silently dropped from the store. Removed the tag; the Supervisor
  appends the add-on version itself and pulls
  `ghcr.io/datapush3r/pi-agent-ha:<version>`.

## 1.2.1 — 2026-09-02

- Rebuilt the pre-built image on a current CI pipeline (migrated GitHub
  Actions to the Node 24 runtime ahead of the Node 20 runner retirement on
  2026-09-23) and simplified the Dockerfile `chmod` step. **No change to
  add-on behavior** — same image contents as 1.2.0.
- Version bump so existing installs (still on 1.1.x) show a fresh update
  target. The pre-built GHCR image is confirmed live for `amd64` + `arm64`.

## 1.2.0 — 2026-09-02

- **Pre-built container images** hosted on GHCR (`ghcr.io/datapush3r/pi-agent-ha`),
  built for `amd64` and `arm64` on every push. Installing and updating now
  **pull** the image instead of building it locally on the Home Assistant box.
- Dropped `armv7` support — the current `ghcr.io/home-assistant/base` image only
  publishes `amd64`/`arm64`, so `armv7` installs were already impossible.
- Pinned the bundled `ha` CLI to 5.4.0 — the previous build-time "fetch latest"
  call hit GitHub's API, which is rate-limited (403) on shared CI runners.

## 1.1.1 — 2026-09-02

- Set tmux `extended-keys-format csi-u` — fixes pi's "extended-keys-format is
  xterm" startup warning; modified-Enter (multi-line input) now works as pi
  expects.

## 1.1.0 — 2026-09-02

- **Local LLM setup via add-on options:** new `local_*` options
  (`local_base_url`, `local_model`, `local_provider_name`, `local_api`,
  `local_api_key`, `local_reasoning`, `local_context_window`,
  `local_max_tokens`) generate pi's `models.json` at startup — no hand-editing
  a JSON file on HA. When `local_base_url` is set, `provider`/`model` fall back
  to the local LLM. The hand-written `/config/pi-agent-ha/models.json` file
  still works when the options are left empty.
- The tmux session now survives pi exiting: the panel shows pi's error and
  drops to a shell instead of dying silently.
- Enabled tmux `extended-keys` (required for pi's modified-Enter multi-line
  input).
- Hardened option loading for the new bashio shipped in the latest base image
  (missing option keys could previously leak the literal string `null` into
  flags and env vars).

## 1.0.0 — 2026-09-02

- Initial release.
- Browser terminal panel (ttyd via ingress, no host ports), persistent tmux
  session that survives tab closes and HA restarts, opens in `/config`.
- Ships the `ha` CLI, git, and ripgrep. pi state (settings, auth, sessions)
  persists in `/data`.
- Cloud auth via the `api_key` add-on option (any provider via `api_key_env`)
  or interactive `/login` in the terminal.
- Local LLMs via a hand-written `/config/pi-agent-ha/models.json`
  (synced into pi's state dir at start; pi reloads it on every `/model` open).
- Startup health check (5/5), `auto_launch_pi` and `tmux_mouse` options.
- No host port binding (ingress-only panel) and a BuildKit-era Dockerfile
  without a separate build.yaml (required by HA builds since 2026.04).
