# Pi Agent Terminal for Home Assistant

A Home Assistant add-on that runs the [pi coding agent](https://pi.dev/) in a
browser-based terminal, right inside your dashboard.

![Pi Agent Terminal running in the Home Assistant dashboard](pi-agent-ha/screenshot.png)

This repository is the **add-on source**. The full user documentation and
changelog live in the add-on directory and render directly in the Home
Assistant **Add-on Store**:

- **Documentation** → [`pi-agent-ha/README.md`](pi-agent-ha/README.md)
- **Changelog** → [`pi-agent-ha/CHANGELOG.md`](pi-agent-ha/CHANGELOG.md)

## Add the add-on store

**From within Home Assistant**, use this button to open the add-repository screen with this repo pre-filled:

[![My](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fdatapush3r%2Fpi-agent-ha)

Or add it manually:

1. Home Assistant → **Settings → Add-ons → Add-on Store**
2. Top-right menu (⋮) → **Repositories**
3. Add `https://github.com/datapush3r/pi-agent-ha` → **Add**
4. Install **Pi Agent Terminal** and open the panel from the sidebar

Pre-built images for `amd64` and `arm64` are hosted on
[GitHub Container Registry](https://ghcr.io/datapush3r/pi-agent-ha) — installing
and updating **pull** the image instead of building on your Home Assistant box.

[Full documentation →](pi-agent-ha/README.md) · [Changelog →](pi-agent-ha/CHANGELOG.md)

**License:** MIT
