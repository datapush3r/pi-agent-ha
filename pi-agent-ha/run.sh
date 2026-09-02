#!/usr/bin/with-contenv bashio

# Enable strict error handling
set -e
set -o pipefail

# Initialize environment for the pi coding agent using /data (HA best practice:
# /data is the guaranteed-writable persistent volume for add-on state).
init_environment() {
    local data_home="/data/home"
    local config_dir="/data/.config"
    local cache_dir="/data/.cache"
    local state_dir="/data/.local/state"

    bashio::log.info "Initializing pi environment in /data..."

    # pi stores settings, auth, and sessions under ~/.pi/agent (i.e.
    # /data/home/.pi/agent with the HOME below) — persistent across restarts.
    if ! mkdir -p "$data_home/.pi/agent" "$config_dir" "$cache_dir" "$state_dir"; then
        bashio::log.error "Failed to create directories in /data"
        exit 1
    fi
    chmod 755 "$data_home" "$data_home/.pi" "$data_home/.pi/agent" "$config_dir" "$cache_dir" "$state_dir"

    # Set XDG and standard environment variables
    export HOME="$data_home"
    export XDG_CONFIG_HOME="$config_dir"
    export XDG_CACHE_HOME="$cache_dir"
    export XDG_STATE_HOME="$state_dir"
    export XDG_DATA_HOME="/data/.local/share"

    # Optional provider credential via add-on option. When set, export it under
    # the named env var (default ANTHROPIC_API_KEY) and pi picks it up. When
    # empty, the user runs interactive /login inside the terminal instead.
    local api_key api_key_env
    api_key=$(bashio::config 'api_key' '')
    api_key_env=$(bashio::config 'api_key_env' 'ANTHROPIC_API_KEY')
    # Guard: a bad/empty env name would make the export fail and (with set -e)
    # crash-loop the add-on. Fall back to the default if it's not a valid identifier.
    if ! [[ "$api_key_env" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
        bashio::log.warning "api_key_env '${api_key_env}' is not a valid env var name; using ANTHROPIC_API_KEY"
        api_key_env="ANTHROPIC_API_KEY"
    fi
    if [ -n "$api_key" ]; then
        export "$api_key_env=$api_key"
        bashio::log.info "Provider credential configured via add-on option (env: ${api_key_env})"
    else
        bashio::log.info "No api_key option set — use interactive /login in the terminal"
    fi

    # Create profile script for persistent environment variables.
    # This ensures ALL bash sessions (including ttyd shells) have correct env.
    cat >/etc/profile.d/pi-env.sh <<'PROFILE_EOF'
# pi agent environment - auto-loaded for all bash sessions
export HOME="/data/home"
export XDG_CONFIG_HOME="/data/.config"
export XDG_CACHE_HOME="/data/.cache"
export XDG_STATE_HOME="/data/.local/state"
export XDG_DATA_HOME="/data/.local/share"
PROFILE_EOF
    chmod 644 /etc/profile.d/pi-env.sh

    bashio::log.info "Environment initialized:"
    bashio::log.info "  - Home: $HOME"
    bashio::log.info "  - pi state: $HOME/.pi/agent"
    bashio::log.info "  - Config: $XDG_CONFIG_HOME"
    bashio::log.info "  - Cache: $XDG_CACHE_HOME"
}

# Sync an optional custom models.json (local LLMs: Ollama, LM Studio, vLLM,
# any OpenAI-compatible server) from the HA config dir into pi's state dir.
# The /config copy is the source of truth; only overwrite the live file when
# the source is newer (or the target is missing) so in-terminal edits survive
# restarts. pi reloads models.json on every /model open, so no restart needed
# after the file is in place.
sync_models_json() {
    local models_src="/config/pi-agent-ha/models.json"
    local models_dst="${HOME}/.pi/agent/models.json"

    if [ ! -f "$models_src" ]; then
        return 0
    fi

    if [ ! -f "$models_dst" ] || [ "$models_src" -nt "$models_dst" ]; then
        cp "$models_src" "$models_dst"
        bashio::log.info "Synced models.json: ${models_src} -> ${models_dst}"
    else
        bashio::log.info "models.json: keeping existing (source not newer)"
    fi
}

# Setup tmux configuration and session wrapper
setup_tmux() {
    local tmux_conf="${HOME}/.tmux.conf"
    local tmux_mouse
    local tmux_wrapper="/usr/local/bin/tmux-pi"

    tmux_mouse=$(bashio::config 'tmux_mouse' 'false')
    case "${tmux_mouse:-false}" in
    true | on | yes | 1) tmux_mouse="on" ;;
    *) tmux_mouse="off" ;;
    esac
    bashio::log.info "Setting up tmux (mouse: ${tmux_mouse})..."

    cat >"$tmux_conf" <<TMUX_EOF
# Mouse mode is disabled by default so ttyd/browser copy and paste keeps working.
set -g mouse ${tmux_mouse}

# pi requires extended-keys (tmux 3.2+) for modified Enter (multi-line input)
set -g extended-keys on

# Large scrollback buffer
set -g history-limit 50000

# Reduce escape-time so pi/vim feel responsive inside tmux
set -g escape-time 20

# Start window and pane numbering at 1 (easier to reach on keyboard)
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on

# Status bar
set -g status-bg colour235
set -g status-fg colour136
set -g status-left '[#S] '
set -g status-right '%H:%M'
TMUX_EOF

    # Wrapper: attach to existing 'pi' session, or create a fresh one that runs
    # the launch command
    cat >"$tmux_wrapper" <<'WRAPPER_EOF'
#!/bin/bash
if tmux has-session -t pi 2>/dev/null; then
    exec tmux attach-session -t pi
else
    exec tmux new-session -s pi bash -c 'eval "$PI_LAUNCH_CMD"'
fi
WRAPPER_EOF
    chmod +x "$tmux_wrapper"

    bashio::log.info "tmux configured (${tmux_conf})"
}

# Determine the pi launch command based on configuration
get_pi_launch_command() {
    local auto_launch_pi
    local provider
    local model
    local pi_flags=""

    auto_launch_pi=$(bashio::config 'auto_launch_pi' 'true')
    provider=$(bashio::config 'provider' '')
    model=$(bashio::config 'model' '')

    # Only add flags when the option is non-empty
    if [ -n "$provider" ]; then
        pi_flags="${pi_flags} --provider ${provider}"
    fi
    if [ -n "$model" ]; then
        pi_flags="${pi_flags} --model ${model}"
    fi

    if [ "$auto_launch_pi" = "true" ]; then
        # Auto-launch pi; when pi exits the pane drops to a shell instead of
        # the session dying, so pi's error output stays visible on the panel.
        echo "clear && echo 'Welcome to Pi Agent Terminal!' && echo '' && echo 'Starting pi...' && sleep 1 && cd /config && pi${pi_flags}; echo; echo 'pi exited - if unexpected, check the provider/model/api_key options; you can re-run pi here.'; exec bash"
    else
        # Plain shell; user starts pi (or /login) manually. exec bash keeps the
        # session alive (a bare command chain would exit and kill it).
        echo "clear && cd /config && exec bash"
    fi
}

# Start main web terminal
start_web_terminal() {
    local port=7680
    bashio::log.info "Starting web terminal on port ${port}..."

    # Get the appropriate launch command based on configuration
    local launch_command
    launch_command=$(get_pi_launch_command)
    bashio::log.info "Launch command: ${launch_command}"

    # Export launch command so the tmux-pi wrapper and session can access it
    export PI_LAUNCH_CMD="$launch_command"

    # Pre-create the persistent tmux session so the first browser connection is instant
    if ! tmux has-session -t pi 2>/dev/null; then
        bashio::log.info "Creating persistent tmux session 'pi'..."
        tmux new-session -d -s pi bash -c 'eval "$PI_LAUNCH_CMD"'
    else
        bashio::log.info "Reusing existing tmux session 'pi'..."
    fi

    # ttyd attaches every browser connection to the persistent tmux session.
    # If pi is running and you close the browser tab, it keeps running.
    # Reopening the tab re-attaches to the same session.
    exec ttyd \
        --port "${port}" \
        --interface 0.0.0.0 \
        --writable \
        --ping-interval 30 \
        --client-option reconnect=5 \
        "${TMUX_WRAPPER_PATH:-/usr/local/bin/tmux-pi}"
}

# Run health check
run_health_check() {
    if [ -f "/opt/scripts/health-check.sh" ]; then
        bashio::log.info "Running system health check..."
        chmod +x /opt/scripts/health-check.sh
        /opt/scripts/health-check.sh || bashio::log.warning "Some health checks failed but continuing..."
    fi
}

# Main execution
main() {
    bashio::log.info "Initializing Pi Agent Terminal add-on..."

    init_environment
    sync_models_json
    setup_tmux
    run_health_check
    start_web_terminal
}

# Execute main function
if [ "${PI_RUN_SH_SKIP_MAIN:-false}" != "true" ]; then
    main "$@"
fi
