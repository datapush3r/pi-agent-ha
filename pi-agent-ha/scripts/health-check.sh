#!/usr/bin/with-contenv bashio

# Informational startup health check. Always exits 0 — never blocks add-on
# startup; failures are logged as warnings.
pass=0
fail=0

check() {
    local name="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        bashio::log.info "  [PASS] ${name}"
        pass=$((pass + 1))
    else
        bashio::log.warning "  [FAIL] ${name}"
        fail=$((fail + 1))
    fi
}

bashio::log.info "Health check:"

check "pi CLI" pi --version

# pi requires node >= 22.19.0
if node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=19)?0:1)" 2>/dev/null; then
    bashio::log.info "  [PASS] node version ($(node -v) satisfies >= 22.19.0)"
    pass=$((pass + 1))
else
    bashio::log.warning "  [FAIL] node version too old for pi (found: $(node -v 2>/dev/null || echo 'node missing'))"
    fail=$((fail + 1))
fi

check "ttyd present" command -v ttyd
check "tmux present" command -v tmux
check "ha CLI" ha --help

bashio::log.info "Health check complete: ${pass} passed, ${fail} failed (informational)"
exit 0
