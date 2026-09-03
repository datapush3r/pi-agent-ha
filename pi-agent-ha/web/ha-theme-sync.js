// pi-agent-ha: sync the terminal panel to the Home Assistant theme.
// Spliced into a copy of ttyd's stock page (theme_mode=inherit). The panel
// runs as a same-origin iframe inside the HA dashboard, so we can read HA's
// CSS variables from the parent page. We apply them to the xterm instance
// (window.term, exposed by ttyd's client) and to the page background.
// pi's own TUI follows the terminal background via its "light/dark" theme
// setting (OSC 11 background query — answered by the bundled xterm).
// Cross-origin (panel opened directly) -> SecurityError -> no-op (stock look).
(() => {
  const POLL_MS = 2000;
  let seen = null; // last HA colors observed (bg|fg)
  let applied = null; // set only once the xterm theme actually took effect

  const lum = (c) => {
    let r, g, b;
    const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) h = h.split("").map((x) => x + x).join("");
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    } else {
      const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return 0.5;
      r = +m[1];
      g = +m[2];
      b = +m[3];
    }
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };

  const readParent = () => {
    try {
      const p = window.parent;
      if (!p || p === window) return null; // top-level: no HA host
      const doc = p.document;
      const cs = p.getComputedStyle(doc.documentElement);
      const bg =
        (cs.getPropertyValue("--primary-background-color") || "").trim() ||
        p.getComputedStyle(doc.body).backgroundColor;
      const fg = (cs.getPropertyValue("--primary-text-color") || "").trim();
      return bg ? { bg, fg } : null;
    } catch {
      return null; // cross-origin: do nothing
    }
  };

  const tick = () => {
    const c = readParent();
    if (!c) return;
    seen = c.bg + "|" + (c.fg || "");
    if (seen === applied) return;
    const dark = lum(c.bg) < 0.5;
    const text = c.fg || (dark ? "#d3d8e0" : "#1a1c1e");
    // Page chrome always follows; the xterm theme only once window.term exists.
    document.documentElement.style.backgroundColor = c.bg;
    if (document.body) document.body.style.backgroundColor = c.bg;
    const t = window.term;
    if (t && t.options) {
      const th = t.options.theme || {};
      t.options.theme = { ...th, background: c.bg, foreground: text, cursor: text };
      applied = seen;
    }
  };

  tick();
  setInterval(tick, POLL_MS);
})();
