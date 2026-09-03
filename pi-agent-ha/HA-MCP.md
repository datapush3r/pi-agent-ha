# Home Assistant control via MCP (optional)

Control Home Assistant from pi through a **Model Context Protocol (MCP) server**.
This is an optional integration: leave `ha_mcp_url` empty and the add-on runs
exactly the same without it — the extension is a graceful no-op.

- [What you get](#what-you-get)
- [Quickstart: the ha-mcp app (recommended)](#quickstart-the-ha-mcp-app-recommended)
- [Tools: `ha_tools` and `ha_call`](#tools-ha_tools-and-ha_call)
- [Alternative: HA's built-in MCP server](#alternative-has-built-in-mcp-server)
- [Behavior notes](#behavior-notes)
- [Options](#options)
- [Troubleshooting](#troubleshooting)

## What you get

A small pi extension (baked into the image, installed into pi's extensions dir
at startup) acts as an MCP *Streamable HTTP* client and exposes the connected
MCP server's tools to the agent as two tools:

- **`ha_tools`** — list the tools the server exposes, each with its
  description and input schema. pi uses this to discover what it can do.
- **`ha_call`** — call one of those tools by name with JSON arguments.

The extension speaks standard MCP (protocol `2025-06-18`): it initializes a
session, tracks the `Mcp-Session-Id` header, and caches the tool list. It
therefore works with **any** MCP server that matches — the two intended
backends are the [homeassistant-ai ha-mcp server app](#quickstart-the-ha-mcp-app-recommended)
and [HA's built-in MCP server](#alternative-has-built-in-mcp-server).

### The recommended backend: the ha-mcp app

The [homeassistant-ai "Home Assistant MCP Server" app](https://github.com/homeassistant-ai/ha-mcp)
is a full-featured HA MCP server — beyond controlling entities it can:

- build and edit **automations, dashboards, and scripts**
- **debug** automations from traces
- read **history and logs**
- manage **helpers, areas, zones, labels, HACS, backups**, and the
  device/entity registry

(Exact capabilities depend on the app version you install and which entities
you expose — see that project's docs.)

## Quickstart: the ha-mcp app (recommended)

1. **Add its repo** (once): Settings → Apps → ⋮ → *Repositories* → add
   `https://github.com/homeassistant-ai/ha-mcp`.
2. **Install** the **Home Assistant MCP Server** app and start it.
3. Open the app's **Logs** tab and copy the **MCP URL** it prints (a
   secret-URL endpoint — no token needed).
4. In this add-on: Settings → Options → paste that URL into **`ha_mcp_url`**
   → save → restart pi-agent-ha.

Confirm it worked:

- The add-on log shows `HA MCP: enabled (url=…)`.
- When pi (re)starts, the terminal shows a startup notification
  `HA MCP ready: N tool(s) (url)` — `N` should be greater than zero.

Then just ask pi for things like *"create an automation that turns the
living room lights on at sunset"* or *"show me why automation X didn't
trigger"* — it lists the server's tools with `ha_tools` and drives HA with
`ha_call`.

## Tools: `ha_tools` and `ha_call`

| Tool | Purpose | Arguments |
| --- | --- | --- |
| `ha_tools` | List the MCP tools available, with a description and input schema for each | `filter` *(optional)* — substring to narrow the list to matching name/description |
| `ha_call` | Call one MCP tool by name with JSON arguments | `tool` — the MCP tool name (from `ha_tools`); `args` *(optional)* — its parameters |

pi is instructed (via the tools' prompt guidelines) to discover with
`ha_tools` first, then invoke with `ha_call`.

## Alternative: HA's built-in MCP server

Home Assistant ships its own MCP server at `http://homeassistant:8123/api/mcp`
(MCP *Streamable HTTP*). It exposes a smaller, entity-control-focused tool
set (turn on/off, set light/climate, vacuum, timers, and similar) scoped to
the entities the calling user can access.

To use it:

1. Create a **long-lived access token** — HA: profile avatar → *Security* →
   *Long-lived access tokens* → *Generate Token*.
   For least privilege, create a dedicated read-only user and generate the
   token from that user's profile.
2. Set **`ha_mcp_url`** to `http://homeassistant:8123/api/mcp`.
3. Set **`ha_mcp_token`** to that token (masked as a password option).
4. Restart pi-agent-ha.

The ha-mcp app is the more capable backend — use the built-in server if you
only want simple entity control with zero extra apps installed.

## Behavior notes

- **Output is hidden by default.** `ha_tools`/`ha_call` blocks render empty in
  the terminal so HA calls don't clutter the session. Press `ctrl+o` (pi's
  *expand tool output* keybinding) to show the full output, including which
  MCP tool was called. This is display-only — the model always receives the
  full result.
- **Readiness is reported, never blocking.** The extension warms its tool
  cache in the background at startup. A bad URL or token never prevents pi
  from starting — you'll see an `HA MCP: <error>` notification instead, and
  the same error surfaces again on the first tool call.
- **Tool calls time out at 15 seconds.** A call that exceeds this returns an
  error to the model (pi can retry or adapt).
- **Session state is kept in memory.** The MCP session (and tool list) is
  re-established when the add-on restarts.
- **Disabling is instant.** Clear `ha_mcp_url` and restart — the tools
  disappear and nothing else changes.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `ha_mcp_url` | *(empty)* | MCP server URL. This is the on-switch: empty = HA control disabled. Set it to the ha-mcp app's MCP URL (from its Logs tab) or `http://homeassistant:8123/api/mcp`. |
| `ha_mcp_token` | *(empty)* | Optional Bearer token, only if the endpoint requires one (e.g. HA's built-in `/api/mcp` with a long-lived access token). The ha-mcp app's secret-URL endpoint does not need a token. |

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| No `HA MCP ready` notification; `HA MCP: …` error at pi start | Check `ha_mcp_url` against the URL in the ha-mcp app's Logs tab (it can change when the app restarts), and that the app is started. |
| `HA call failed: … HTTP 401` | Token problem on a token-gated endpoint — regenerate the long-lived access token and update `ha_mcp_token`. |
| `HA call failed: … timed out` | The MCP server didn't answer within 15 s — check the server app is healthy and not stuck. |
| `ha_tools` lists tools but `ha_call` errors | Call the tool with the exact name and arguments `ha_tools` showed; the server's schemas are the source of truth. |
| Added options but tools are missing after a plain `docker restart` | Option changes apply on an add-on restart from the Supervisor (Settings → … → *Restart*), which re-provisions the options into the container. |
| Still nothing in `ha_tools` | The endpoint may expose no tools for this user/scope — review the server app's configuration (exposed entities) and its logs. |

---

*The MCP bridge lives in [`extensions/ha-mcp.ts`](extensions/ha-mcp.ts); startup plumbing in [`run.sh`](run.sh). The upstream projects ([ha-mcp app](https://github.com/homeassistant-ai/ha-mcp), [skills](https://github.com/homeassistant-ai/skills)) are maintained by homeassistant-ai under their own licenses.*
