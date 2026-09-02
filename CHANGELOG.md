# Changelog

All notable changes to the **Pi Agent Terminal** add-on. Newest first.

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
