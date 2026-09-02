ARG BUILD_FROM=ghcr.io/home-assistant/base:latest
FROM ${BUILD_FROM}

# OCI image labels (migrated from build.yaml on 2026-09-02: HA's BuildKit-based
# build workflow no longer reads build.yaml; LABEL here applies on every path,
# incl. plain `docker build` and the Supervisor's local build).
LABEL \
    org.opencontainers.image.title="Home Assistant Add-on: Pi Agent Terminal" \
    org.opencontainers.image.description="Terminal interface for the pi coding agent (pi.dev)" \
    org.opencontainers.image.source="https://github.com/datapush3r/pi-agent-ha" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.version="1.0.0"

# Core tooling in a single layer. nodejs/npm are required by pi (a Node CLI);
# bash/git/ripgrep are the runtime deps pi's tools rely on; tmux + ttyd provide
# the persistent web terminal.
RUN apk add --no-cache \
    nodejs \
    npm \
    bash \
    curl \
    jq \
    git \
    ripgrep \
    tmux \
    ttyd

# pi requires Node >= 22.19.0. Fail the build early if the base image's node is
# too old (Alpine 3.21+ ships node 22.23+, so this is a guard, not the path).
RUN node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=19)?0:1)"

# Install the pi coding agent CLI. pi is pure JS (no native build step), so
# --ignore-scripts is safe and keeps the image lean (per pi's docs).
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# --- Architecture resolution (mirrors the reference add-on) ---
# Home Assistant Supervisor always passes BUILD_ARCH (amd64|aarch64|armv7|...).
# TARGETARCH/TARGETVARIANT are the automatic BuildKit values. BuildKit never
# sets TARGETARCH to "arm/v7" (it is "arm" + variant "v7"), so resolve a single
# canonical arch from the most reliable source available.
ARG BUILD_ARCH
ARG TARGETARCH
ARG TARGETVARIANT

RUN ADDON_ARCH="${BUILD_ARCH}"; \
    if [ -z "${ADDON_ARCH}" ]; then \
        case "${TARGETARCH}/${TARGETVARIANT}" in \
            amd64/*)      ADDON_ARCH="amd64" ;; \
            arm64/*)      ADDON_ARCH="aarch64" ;; \
            arm/v7)       ADDON_ARCH="armv7" ;; \
            arm/v6)       ADDON_ARCH="armhf" ;; \
            arm/)         ADDON_ARCH="armv7" ;; \
            386/*)        ADDON_ARCH="i386" ;; \
        esac; \
    fi; \
    if [ -z "${ADDON_ARCH}" ]; then \
        case "$(uname -m)" in \
            x86_64)        ADDON_ARCH="amd64" ;; \
            aarch64|arm64) ADDON_ARCH="aarch64" ;; \
            armv7l)        ADDON_ARCH="armv7" ;; \
            armv6l)        ADDON_ARCH="armhf" ;; \
            i386|i686)     ADDON_ARCH="i386" ;; \
        esac; \
    fi; \
    if [ -z "${ADDON_ARCH}" ]; then \
        echo "Cannot determine target architecture (BUILD_ARCH='${BUILD_ARCH}' TARGETARCH='${TARGETARCH}' TARGETVARIANT='${TARGETVARIANT}' uname='$(uname -m)')" && exit 1; \
    fi; \
    printf '%s\n' "${ADDON_ARCH}" > /etc/addon-arch && \
    echo "Resolved add-on architecture: ${ADDON_ARCH} (BUILD_ARCH='${BUILD_ARCH}' TARGETARCH='${TARGETARCH}/${TARGETVARIANT}' uname='$(uname -m)')"

# Install the Home Assistant CLI (ha command) so pi can manage HA directly.
# Version is pinned (bump manually when upgrading) instead of fetched from
# the GitHub API at build time — unauthenticated api.github.com calls are
# rate-limited (403) on shared CI runners. 5.4.0 ships ha_amd64/ha_aarch64,
# matching the base image's architecture support.
RUN ADDON_ARCH=$(cat /etc/addon-arch); \
    case "${ADDON_ARCH}" in \
        amd64)   HA_ARCH="amd64" ;; \
        aarch64) HA_ARCH="aarch64" ;; \
        *)       echo "Unsupported architecture: ${ADDON_ARCH}" && exit 1 ;; \
    esac && \
    HA_VERSION="5.4.0" && \
    echo "Installing Home Assistant CLI ${HA_VERSION} for ${HA_ARCH}..." && \
    curl -fsSL -o /usr/bin/ha \
        "https://github.com/home-assistant/cli/releases/download/${HA_VERSION}/ha_${HA_ARCH}" && \
    chmod +x /usr/bin/ha && \
    echo "Home Assistant CLI ${HA_VERSION} installed successfully"

# pi opens in the HA config directory (mounted rw by the add-on)
RUN mkdir -p /config
WORKDIR /config

# Copy startup script and helper scripts
COPY run.sh /run.sh
COPY scripts/ /opt/scripts/
RUN chmod +x /run.sh /opt/scripts/*.sh

# Use exec form for better signal handling
CMD ["/run.sh"]
