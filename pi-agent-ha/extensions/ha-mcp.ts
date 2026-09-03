/**
 * ha-mcp.ts — bridge pi to a Home Assistant MCP server (Streamable HTTP).
 *
 * Intended backend: the homeassistant-ai "Home Assistant MCP Server" app
 * (https://github.com/homeassistant-ai/ha-mcp) — full control, build (automations,
 * dashboards, scripts), and debug of Home Assistant. Also works with HA's built-in
 * MCP server if you set ha_mcp_url to http://homeassistant:8123/api/mcp and
 * ha_mcp_token to an HA long-lived access token.
 *
 * Exposes the server to the pi agent as two tools:
 *   - ha_tools : list the MCP tools available (+ input schemas)
 *   - ha_call  : call a specific tool by name with JSON arguments
 *
 * Transport: MCP "Streamable HTTP" — POST JSON-RPC to HA_MCP_URL.
 * Auth: optional Bearer HA_MCP_TOKEN (only if the endpoint requires it; the
 *       ha-mcp app's secret-URL endpoint does not).
 *
 * Gated on HA_MCP_URL: when it is unset, this extension is a no-op and pi runs
 * with no HA tools (graceful). Set the add-on's ha_mcp_url option to the MCP
 * server URL (from the ha-mcp app's Logs tab) to enable.
 *
 * Env:
 *   HA_MCP_URL      the MCP server URL (required to activate)
 *   HA_MCP_TOKEN    optional Bearer token (only for token-gated endpoints)
 *   HA_HIDE_OUTPUT  "true" (default) hides result bodies in the TUI (call
 *                   lines stay visible); "false" uses pi's default rendering
 */
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";

const MCP_URL = process.env.HA_MCP_URL || "";
const MCP_TOKEN = process.env.HA_MCP_TOKEN || "";
const HIDE_OUTPUT =
	(process.env.HA_HIDE_OUTPUT ?? "true").toLowerCase() !== "false";
const PROTOCOL_VERSION = "2025-06-18";
const TIMEOUT_MS = 15000;

let sessionId: string | undefined;
let nextId = 0;
let toolsCache: any[] | null = null;

let status: "pending" | "ready" | "error" = "pending";
let toolCount = 0;
let errMsg: string | null = null;

/** Parse JSON with a descriptive error (never a raw parse exception). */
function parseJson(text: string): any {
	try {
		return JSON.parse(text);
	} catch (e: any) {
		throw new Error(`MCP response was not valid JSON: ${e?.message || e}`);
	}
}

/** Parse a Streamable HTTP response body: application/json or an SSE stream. */
function parseBody(contentType: string, text: string): any {
	const trimmed = text.trim();
	if (contentType.includes("text/event-stream")) {
		let last = "";
		for (const raw of trimmed.split(/\r?\n/)) {
			const line = raw.startsWith("\r") ? raw.slice(1) : raw;
			if (line.startsWith("data:")) last = line.slice(5).trim();
		}
		if (!last) return undefined;
		return parseJson(last);
	}
	if (!trimmed) return undefined;
	return parseJson(trimmed);
}

/** One MCP JSON-RPC request, or a notification when notify=true. */
async function rpc(method: string, params: any, notify = false): Promise<any> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Accept: "application/json, text/event-stream",
	};
	if (MCP_TOKEN) headers["Authorization"] = `Bearer ${MCP_TOKEN}`;
	if (sessionId) headers["Mcp-Session-Id"] = sessionId;

	const payload: Record<string, unknown> = { jsonrpc: "2.0", method, params };
	if (!notify) payload.id = ++nextId;

	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
	let res: any;
	try {
		res = await fetch(MCP_URL, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
			signal: ctrl.signal,
		});
	} catch (e: any) {
		throw new Error(
			`MCP ${method}: ${e && e.name === "AbortError" ? "timed out" : e?.message || e}`,
		);
	} finally {
		clearTimeout(timer);
	}

	const sid = res.headers.get("mcp-session-id");
	if (sid) sessionId = sid;

	if (notify) {
		if (!res.ok) throw new Error(`MCP ${method} (notify): HTTP ${res.status}`);
		return undefined;
	}
	const ct = res.headers.get("content-type") || "";
	const text = await res.text();
	if (!res.ok)
		throw new Error(`MCP ${method}: HTTP ${res.status} ${text.slice(0, 200)}`);
	const msg = parseBody(ct, text);
	if (msg && msg.error)
		throw new Error(`MCP ${method}: ${JSON.stringify(msg.error).slice(0, 200)}`);
	return msg ? msg.result : undefined;
}

/** Initialize the MCP session (once) and fetch + cache the tool list. */
async function listTools(): Promise<any[]> {
	if (toolsCache) return toolsCache;
	await rpc("initialize", {
		protocolVersion: PROTOCOL_VERSION,
		capabilities: {},
		clientInfo: { name: "pi-agent-ha", version: "1.0.0" },
	});
	await rpc("notifications/initialized", {}, true);
	const list = await rpc("tools/list", {});
	toolsCache = (list && list.tools) || [];
	return toolsCache;
}

/** Convert an MCP content array (or any value) into plain text. */
function contentToText(content: any): string {
	if (content == null) return "";
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((c: any) =>
				c &&
				typeof c === "object" &&
				c.type === "text" &&
				typeof c.text === "string"
					? c.text
					: JSON.stringify(c),
			)
			.join("\n");
	}
	return JSON.stringify(content);
}

/**
 * TUI display for ha-mcp tool calls. With the hide_ha_output option on
 * (default) the result body renders to zero lines so it takes no terminal
 * space, while the call line stays visible ("HA call → hass_turn_on").
 * Pressing the "expand tool output" keybinding (default ctrl+o) renders the
 * full result. With the option off, pi's default rendering shows everything.
 * The model always receives the full result — this only affects the TUI.
 */
function hiddenComponent(): any {
	return new Text("", 0, 0);
}

function haCallLabel(o: any): string {
	const t = (o && (o.tool || (o.details && o.details.tool))) || "";
	return t ? `HA call → ${t}` : "HA call";
}

/**
 * Render props for a ha-mcp tool: collapsed result (zero lines) with a
 * visible call line, or {} to fall back to pi's default rendering.
 */
function renderProps(label: (o: any) => string): any {
	if (!HIDE_OUTPUT) return {};
	return {
		renderShell: "self",
		renderCall: (args: any, theme: any) =>
			new Text(theme.fg("toolTitle", label(args || {})), 0, 0),
		renderResult: (result: any, options: any, theme: any) =>
			options && options.expanded
				? expandedComponent(label(result || {}), result, theme)
				: hiddenComponent(),
	};
}

function expandedComponent(label: string, result: any, theme: any): any {
	const text = contentToText(
		result && result.content !== undefined
			? result.content
			: result && result.details,
	);
	const header = theme.fg("toolTitle", theme.bold(label));
	const body = theme.fg("toolOutput", text || "(no output)");
	return new Text(`${header}\n${body}`, 0, 0);
}

export default async function haMcpExtension(pi: any) {
	// Graceful no-op when disabled: no MCP URL => no HA tools, pi runs normally.
	// Set the add-on's ha_mcp_url option to the MCP server URL to enable.
	if (!MCP_URL) return;

	const listSchema = Type.Object({
		filter: Type.Optional(
			Type.String({
				description:
					"Optional substring to narrow the list to tools whose name/description match",
			}),
		),
	});
	const callSchema = Type.Object({
		tool: Type.String({
			description:
				"The Home Assistant MCP tool name to call (see ha_tools output)",
		}),
		args: Type.Optional(Type.Object({}, { additionalProperties: true }) as any),
	});

	pi.registerTool({
		name: "ha_tools",
		label: "HA tools",
		description:
			"List the Home Assistant MCP tools available to this add-on, with a description and input schema for each.",
		promptSnippet:
			"List available Home Assistant tools (then use ha_call to invoke one).",
		promptGuidelines: [
			"Use ha_tools to discover the Home Assistant tools before calling ha_call.",
		],
		parameters: listSchema,
		...renderProps(() => "HA tools"),
		async execute(_toolCallId: string, params: any) {
			try {
				const tools = await listTools();
				const f = String((params && params.filter) || "").toLowerCase();
				const shown = f
					? tools.filter((t) =>
							`${t.name} ${t.description || ""}`.toLowerCase().includes(f),
						)
					: tools;
				const body = shown
					.map(
						(t) =>
							`### ${t.name}\n${t.description || ""}\ninput: ${JSON.stringify(t.inputSchema || {})}`,
					)
					.join("\n\n");
				return {
					content: [
						{ type: "text", text: body || "(no Home Assistant tools exposed)" },
					],
					details: { count: shown.length },
				};
			} catch (e: any) {
				return {
					content: [
						{ type: "text", text: `HA tools unavailable: ${e?.message || e}` },
					],
				};
			}
		},
	});

	pi.registerTool({
		name: "ha_call",
		label: "HA call",
		description:
			"Call a specific Home Assistant MCP tool by name with JSON arguments (use ha_tools to list names and schemas).",
		promptSnippet: "Call a Home Assistant tool by name with JSON arguments.",
		promptGuidelines: [
			"Use ha_call to invoke one Home Assistant tool; pass its name in 'tool' and its parameters in 'args'.",
		],
		parameters: callSchema,
		...renderProps(haCallLabel),
		async execute(_toolCallId: string, params: any) {
			const name = params && params.tool;
			if (!name || typeof name !== "string") {
				return {
					content: [
						{ type: "text", text: "ha_call needs a 'tool' name (see ha_tools)" },
					],
				};
			}
			try {
				const result = await rpc("tools/call", {
					name,
					arguments: (params && params.args) || {},
				});
				const isError = !!(result && result.isError);
				const text = contentToText(
					result && result.content !== undefined ? result.content : result,
				);
				return {
					content: [
						{
							type: "text",
							text: text || (isError ? "tool returned no output" : "(no output)"),
						},
					],
					details: { tool: name, isError },
				};
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `HA call failed: ${e?.message || e}` }],
				};
			}
		},
	});

	// Warm the cache and report readiness once (best-effort: a bad token never
	// blocks pi startup — errors also surface on the first tool call).
	listTools()
		.then((tools) => {
			status = "ready";
			toolCount = tools.length;
			console.log(
				`[ha-mcp] ready: ${tools.length} Home Assistant tool(s) at ${MCP_URL}`,
			);
		})
		.catch((e) => {
			status = "error";
			errMsg = e?.message || String(e);
			console.error(`[ha-mcp] could not reach HA MCP server: ${errMsg}`);
		});

	pi.on("session_start", (_event: any, ctx: any) => {
		const ui = ctx && ctx.ui;
		if (!ui || typeof ui.notify !== "function") return;
		if (status === "ready")
			ui.notify(`HA MCP ready: ${toolCount} tool(s) (${MCP_URL})`, "info");
		else if (status === "error") ui.notify(`HA MCP: ${errMsg}`, "error");
		// status === "pending": still connecting; no notification.
	});
}
