import { basename } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { canTrace, resolveConfig } from "./config.ts";
import {
	flushClient,
	getClient,
	type LangfuseGeneration,
	type LangfuseSpan,
	type LangfuseTrace,
	shutdownClient,
} from "./langfuse-client.ts";
import {
	EXTENSION_ID,
	getStoredSettingsValues,
	registerSettings,
	type SettingsValues,
	setSettingsValues,
} from "./settings.ts";

interface PiUsage {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	totalTokens?: number;
	cost?: { input?: number; output?: number; total?: number };
}

interface PromptState {
	trace: LangfuseTrace;
	promptSpan?: LangfuseSpan;
	userPrompt: string;
	cwd: string;
	startedAt: number;
	toolCalls: number;
	toolErrors: number;
	turns: number;
	tokensIn: number;
	tokensOut: number;
	cacheRead: number;
	cacheWrite: number;
	lastAssistantText: string;
	lastUsage?: PiUsage;
	activeTurns: Map<number, TurnState>;
	activeTools: Map<string, ToolState>;
}

interface TurnState {
	index: number;
	startedAt: number;
	span?: LangfuseSpan;
}

interface ToolState {
	toolName: string;
	startedAt: number;
	span?: LangfuseSpan;
	argsSummary: string;
	partialOutput?: string;
	resultOutput?: string;
	isError?: boolean;
}

let currentSessionId = "";
let currentSessionReason = "startup";
let currentModel = "";
let currentProvider = "";
let promptState: PromptState | null = null;
let compactCount = 0;

function getLiveSettingsView(
	settings: Partial<SettingsValues>,
): SettingsValues {
	const config = resolveConfig(settings);
	return {
		enabled: config.enabled,
		"public-key": config.publicKey,
		"secret-key": config.secretKey,
		"base-url": config.host,
	};
}

function announceConfigState(settings: Partial<SettingsValues>) {
	const config = resolveConfig(settings);
	if (!config.enabled) {
		console.log("📊 Langfuse: Tracing disabled in extension settings");
		return;
	}
	if (!config.publicKey || !config.secretKey) {
		console.log(
			"📊 Langfuse: Configure public/secret key in settings, config.json, or LANGFUSE_* env vars to enable",
		);
	}
}

function truncate(text: string, max = 1200) {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeJson(value: unknown, max = 1200) {
	try {
		return truncate(JSON.stringify(value, null, 2), max);
	} catch {
		return "[unserializable]";
	}
}

function summarizeToolArgs(toolName: string, args: unknown) {
	if (!args || typeof args !== "object") return safeJson(args, 300);
	const data = args as Record<string, unknown>;
	switch (toolName) {
		case "bash":
			return truncate(String(data.command ?? ""), 300);
		case "read":
			return truncate(
				`${String(data.path ?? "")}#${String(data.offset ?? 1)}:${String(data.limit ?? "")}`,
				300,
			);
		case "write":
		case "edit":
			return truncate(String(data.path ?? ""), 300);
		case "web_search":
			return truncate(
				String(
					data.query ??
						(Array.isArray(data.queries) ? data.queries.join(" | ") : ""),
				),
				300,
			);
		default:
			return safeJson(args, 500);
	}
}

function extractTextFromContent(
	content: Array<{ type: string; text?: string }> | undefined,
) {
	if (!content?.length) return "";
	return content
		.filter((item) => item.type === "text" && item.text)
		.map((item) => item.text)
		.join("\n");
}

function summarizeToolResult(result: unknown) {
	if (!result) return "";
	if (typeof result === "string") return truncate(result, 2000);
	if (typeof result === "object") {
		const data = result as { content?: Array<{ type: string; text?: string }> };
		const text = extractTextFromContent(data.content);
		if (text) return truncate(text, 2000);
	}
	return safeJson(result, 2000);
}

function usageDetailsFromUsage(usage?: PiUsage) {
	if (!usage) return undefined;
	const details: Record<string, number> = {};
	if (usage.input) details.input = usage.input;
	if (usage.output) details.output = usage.output;
	if (usage.cacheRead) details.input_cached_read = usage.cacheRead;
	if (usage.cacheWrite) details.input_cached_write = usage.cacheWrite;
	if (usage.totalTokens) details.total = usage.totalTokens;
	return Object.keys(details).length > 0 ? details : undefined;
}

function standardUsageFromUsage(usage?: PiUsage) {
	if (!usage) return undefined;
	const standard: Record<string, number> = {};
	if (usage.input) standard.input = usage.input;
	if (usage.output) standard.output = usage.output;
	if (usage.totalTokens) {
		standard.total = usage.totalTokens;
	} else if (usage.input || usage.output) {
		standard.total = (usage.input ?? 0) + (usage.output ?? 0);
	}
	return Object.keys(standard).length > 0 ? standard : undefined;
}

function costDetailsFromUsage(usage?: PiUsage) {
	const cost = usage?.cost;
	if (!cost) return undefined;
	const details: Record<string, number> = {};
	if (typeof cost.input === "number") details.input = cost.input;
	if (typeof cost.output === "number") details.output = cost.output;
	if (typeof cost.total === "number") details.total = cost.total;
	return Object.keys(details).length > 0 ? details : undefined;
}

function getUserId() {
	return (
		process.env.PI_LANGFUSE_USER_ID ||
		process.env.LANGFUSE_USER_ID ||
		process.env.USER ||
		process.env.LOGNAME ||
		undefined
	);
}

function buildTraceTags(cwd: string) {
	const tags = ["pi", "pi-langfuse"];
	const projectName = basename(cwd || process.cwd());
	if (projectName) tags.push(`project:${projectName}`);
	if (currentProvider) tags.push(`provider:${currentProvider}`);
	if (currentModel) tags.push(`model:${currentModel}`);
	if (currentSessionReason) tags.push(`session:${currentSessionReason}`);
	return Array.from(new Set(tags)).slice(0, 20);
}

async function finalizePrompt(flush = false) {
	if (!promptState) return;

	for (const [, tool] of promptState.activeTools) {
		tool.span?.end({
			isError: tool.isError ?? true,
			output: tool.resultOutput || tool.partialOutput,
			statusMessage: tool.isError
				? "tool error"
				: "tool ended without completion event",
			metadata: {
				tool: tool.toolName,
				argsSummary: tool.argsSummary,
				durationMs: Date.now() - tool.startedAt,
				abandoned: true,
			},
		});
	}
	promptState.activeTools.clear();

	for (const [, turn] of promptState.activeTurns) {
		turn.span?.end({
			metadata: {
				turnIndex: turn.index,
				durationMs: Date.now() - turn.startedAt,
				abandoned: true,
			},
			statusMessage: "turn ended during cleanup",
		});
	}
	promptState.activeTurns.clear();

	promptState.promptSpan?.end({
		output: promptState.lastAssistantText || undefined,
		metadata: {
			completed: true,
			toolCalls: promptState.toolCalls,
			toolErrors: promptState.toolErrors,
			turns: promptState.turns,
			durationMs: Date.now() - promptState.startedAt,
			compactCount,
		},
	});

	promptState.trace.update({
		output: promptState.lastAssistantText || undefined,
		userId: getUserId(),
		sessionId: currentSessionId || undefined,
		tags: buildTraceTags(promptState.cwd),
		metadata: {
			cwd: promptState.cwd,
			model: currentModel,
			provider: currentProvider,
			sessionReason: currentSessionReason,
			completed: true,
			turns: promptState.turns,
			toolCalls: promptState.toolCalls,
			toolErrors: promptState.toolErrors,
			tokensIn: promptState.tokensIn,
			tokensOut: promptState.tokensOut,
			cacheRead: promptState.cacheRead,
			cacheWrite: promptState.cacheWrite,
			compactCount,
			durationMs: Date.now() - promptState.startedAt,
		},
	});

	if (flush) {
		await flushClient();
	}
	promptState = null;
}

export default async function (pi: ExtensionAPI) {
	let settings = getStoredSettingsValues(pi);

	const refreshConfig = async () => {
		settings = getStoredSettingsValues(pi);
		registerSettings(pi, getLiveSettingsView(settings));
		await finalizePrompt(true);
		await shutdownClient();
		announceConfigState(settings);
	};

	pi.events.on("pi-extension-settings:ready", () => {
		registerSettings(pi, getLiveSettingsView(settings));
	});
	registerSettings(pi, getLiveSettingsView(settings));

	pi.events.on(`pi-extension-settings:${EXTENSION_ID}:changed`, () => {
		void refreshConfig();
	});
	pi.events.on(`extension:settings:changed:${EXTENSION_ID}`, () => {
		void refreshConfig();
	});

	pi.registerCommand("langfuse:toggle", {
		description:
			"Toggle Langfuse tracing or force on/off with /langfuse:toggle [on|off]",
		handler: async (args, ctx) => {
			const current = resolveConfig(settings);
			const nextEnabled =
				args.trim() === "on"
					? true
					: args.trim() === "off"
						? false
						: !current.enabled;

			setSettingsValues({ enabled: nextEnabled });
			await refreshConfig();

			const next = resolveConfig(settings);
			const status = next.enabled ? `enabled → ${next.host}` : "disabled";
			ctx.ui?.notify?.(`Langfuse tracing ${status}`, "info");
		},
	});

	await shutdownClient();
	announceConfigState(settings);

	pi.on("session_start", async (event, ctx) => {
		const sessionFile = ctx.sessionManager.getSessionFile();
		if (sessionFile) {
			const filename = sessionFile.split("/").pop() || "";
			currentSessionId = filename.replace(".jsonl", "");
		}
		const data = event as typeof event & { reason?: string };
		currentSessionReason = data.reason || "startup";
		compactCount = 0;
	});

	pi.on("model_select", async (event, _ctx) => {
		currentModel = event.model?.id || "";
		currentProvider = event.model?.provider || "";
		if (promptState) {
			promptState.trace.update({
				metadata: {
					model: currentModel,
					provider: currentProvider,
				},
				tags: buildTraceTags(promptState.cwd),
			});
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const config = resolveConfig(settings);
		if (!canTrace(config)) return;

		await finalizePrompt(false);

		try {
			const lf = await getClient(config);
			const eventData = event as typeof event & {
				systemPromptOptions?: { cwd?: string };
			};
			const cwd = eventData.systemPromptOptions?.cwd || process.cwd();

			if (!currentModel && ctx.model) {
				currentModel = ctx.model.id || "";
				currentProvider = ctx.model.provider || "";
			}

			const trace = lf.trace({
				name: "pi-agent",
				input: truncate(event.prompt, 2000),
				sessionId: currentSessionId || undefined,
				userId: getUserId(),
				tags: buildTraceTags(cwd),
				metadata: {
					cwd,
					model: currentModel,
					provider: currentProvider,
					sessionReason: currentSessionReason,
				},
			});

			promptState = {
				trace,
				userPrompt: event.prompt,
				cwd,
				startedAt: Date.now(),
				toolCalls: 0,
				toolErrors: 0,
				turns: 0,
				tokensIn: 0,
				tokensOut: 0,
				cacheRead: 0,
				cacheWrite: 0,
				lastAssistantText: "",
				activeTurns: new Map(),
				activeTools: new Map(),
			};
		} catch (e) {
			console.warn("📊 Langfuse: Failed to create trace", e);
		}
	});

	pi.on("agent_start", async () => {
		if (!promptState) return;
		const config = resolveConfig(settings);
		if (!canTrace(config)) return;
		try {
			const lf = await getClient(config);
			promptState.promptSpan = lf.span({
				name: "agent.prompt",
				traceId: promptState.trace.id,
				input: truncate(promptState.userPrompt, 1200),
				metadata: {
					cwd: promptState.cwd,
					model: currentModel,
					provider: currentProvider,
					sessionReason: currentSessionReason,
				},
			});
		} catch (e) {
			console.warn("📊 Langfuse: Failed to create prompt span", e);
		}
	});

	pi.on("turn_start", async (event) => {
		if (!promptState) return;
		const config = resolveConfig(settings);
		if (!canTrace(config)) return;
		promptState.turns += 1;
		const turnState: TurnState = {
			index: event.turnIndex,
			startedAt: Date.now(),
		};
		promptState.activeTurns.set(event.turnIndex, turnState);
		try {
			const lf = await getClient(config);
			turnState.span = lf.span({
				name: "agent.turn",
				traceId: promptState.trace.id,
				parentObservationId: promptState.promptSpan?.id,
				metadata: {
					turnIndex: event.turnIndex,
					turnNumber: promptState.turns,
					model: currentModel,
					provider: currentProvider,
				},
			});
		} catch (e) {
			console.warn("📊 Langfuse: Failed to create turn span", e);
		}
	});

	pi.on("tool_call", async (event) => {
		const tool = promptState?.activeTools.get(event.toolCallId);
		if (!tool) return;
		tool.argsSummary = summarizeToolArgs(event.toolName, event.input);
		tool.span?.update?.({
			input: tool.argsSummary,
			metadata: {
				tool: event.toolName,
				argsSummary: tool.argsSummary,
			},
		});
	});

	pi.on("tool_execution_start", async (event) => {
		if (!promptState) return;
		const config = resolveConfig(settings);
		if (!canTrace(config)) return;

		promptState.toolCalls += 1;
		const activeTurns = Array.from(promptState.activeTurns.values());
		const activeTurn =
			activeTurns.length > 0 ? activeTurns[activeTurns.length - 1] : undefined;
		const toolState: ToolState = {
			toolName: event.toolName,
			startedAt: Date.now(),
			argsSummary: summarizeToolArgs(event.toolName, event.args),
		};
		promptState.activeTools.set(event.toolCallId, toolState);

		try {
			const lf = await getClient(config);
			toolState.span = lf.span({
				name: `tool:${event.toolName}`,
				traceId: promptState.trace.id,
				parentObservationId: activeTurn?.span?.id || promptState.promptSpan?.id,
				input: toolState.argsSummary,
				metadata: {
					tool: event.toolName,
					toolCallId: event.toolCallId,
					argsSummary: toolState.argsSummary,
					turnIndex: activeTurn?.index,
				},
			});
		} catch (e) {
			console.warn("📊 Langfuse: Failed to create tool span", e);
		}
	});

	pi.on("tool_execution_update", async (event) => {
		const tool = promptState?.activeTools.get(event.toolCallId);
		if (!tool) return;
		tool.partialOutput = summarizeToolResult(event.partialResult);
		tool.span?.update?.({
			output: tool.partialOutput,
			metadata: {
				partial: true,
				tool: tool.toolName,
			},
		});
	});

	pi.on("tool_result", async (event) => {
		const tool = promptState?.activeTools.get(event.toolCallId);
		if (!tool) return;
		tool.resultOutput = summarizeToolResult({ content: event.content });
		tool.isError = event.isError;
	});

	pi.on("tool_execution_end", async (event) => {
		const tool = promptState?.activeTools.get(event.toolCallId);
		if (!tool) return;
		tool.isError = event.isError;
		if (event.isError) {
			promptState!.toolErrors += 1;
		}
		const durationMs = Date.now() - tool.startedAt;
		const output =
			summarizeToolResult(event.result) ||
			tool.resultOutput ||
			tool.partialOutput;
		tool.span?.end({
			isError: event.isError,
			output: output || undefined,
			statusMessage: event.isError ? "tool execution failed" : undefined,
			metadata: {
				tool: tool.toolName,
				argsSummary: tool.argsSummary,
				durationMs,
			},
		});
		promptState?.activeTools.delete(event.toolCallId);
	});

	pi.on("turn_end", async (event) => {
		if (!promptState) return;
		const config = resolveConfig(settings);
		if (!canTrace(config)) return;

		const message = event.message as {
			role?: string;
			content?: Array<{ type: string; text?: string }>;
			model?: string;
			usage?: PiUsage;
		};
		const turnState = promptState.activeTurns.get(event.turnIndex);
		const outputText = extractTextFromContent(message.content).trim();
		const usage = message.usage;
		const standardUsage = standardUsageFromUsage(usage);
		const usageDetails = usageDetailsFromUsage(usage);
		const costDetails = costDetailsFromUsage(usage);

		if (message.role === "assistant") {
			promptState.lastAssistantText = truncate(outputText, 4000);
			promptState.lastUsage = usage;
			promptState.tokensIn +=
				(usage?.input ?? 0) +
				(usage?.cacheRead ?? 0) +
				(usage?.cacheWrite ?? 0);
			promptState.tokensOut += usage?.output ?? 0;
			promptState.cacheRead += usage?.cacheRead ?? 0;
			promptState.cacheWrite += usage?.cacheWrite ?? 0;

			try {
				const lf = await getClient(config);
				const generation: LangfuseGeneration = lf.generation({
					name: "llm-response",
					traceId: promptState.trace.id,
					parentObservationId:
						turnState?.span?.id || promptState.promptSpan?.id,
					input: truncate(promptState.userPrompt, 1200),
					output: truncate(outputText, 2000),
					model: message.model || currentModel,
					usage: standardUsage,
					usageDetails,
					costDetails,
					metadata: {
						provider: currentProvider,
						turnIndex: event.turnIndex,
						toolResults: event.toolResults?.length ?? 0,
					},
				});
				generation.end({
					output: truncate(outputText, 2000) || undefined,
					usage: standardUsage,
					usageDetails,
					costDetails,
				});
				if (usage?.input) {
					lf.score({
						name: "input_tokens",
						value: usage.input,
						traceId: promptState.trace.id,
						observationId: generation.id,
						sessionId: currentSessionId || undefined,
					});
				}
				if (usage?.output) {
					lf.score({
						name: "output_tokens",
						value: usage.output,
						traceId: promptState.trace.id,
						observationId: generation.id,
						sessionId: currentSessionId || undefined,
					});
				}
				if (typeof usage?.cost?.total === "number") {
					lf.score({
						name: "total_cost",
						value: usage.cost.total,
						traceId: promptState.trace.id,
						observationId: generation.id,
						sessionId: currentSessionId || undefined,
					});
				}
			} catch (e) {
				console.warn("📊 Langfuse: Failed to create generation", e);
			}
		}

		turnState?.span?.end({
			output: outputText ? truncate(outputText, 1200) : undefined,
			usage: standardUsage,
			usageDetails,
			costDetails,
			metadata: {
				turnIndex: event.turnIndex,
				durationMs: turnState ? Date.now() - turnState.startedAt : undefined,
				toolResults: event.toolResults?.length ?? 0,
			},
		});
		promptState.activeTurns.delete(event.turnIndex);
	});

	pi.on("agent_end", async (event) => {
		if (!promptState) return;
		const eventData = event as {
			messages?: Array<{
				role: string;
				content: Array<{ type: string; text?: string }>;
			}>;
		};
		const messages = eventData.messages || [];
		const lastAssistant = messages
			.filter((message) => message.role === "assistant")
			.pop();
		if (lastAssistant) {
			const output = extractTextFromContent(lastAssistant.content).trim();
			if (output) {
				promptState.lastAssistantText = truncate(output, 4000);
			}
		}
		await finalizePrompt(true);
	});

	pi.on("session_compact", async () => {
		compactCount += 1;
		promptState?.trace.update({
			metadata: {
				compactCount,
				lastCompactedAt: new Date().toISOString(),
			},
		});
	});

	pi.on("session_shutdown", async () => {
		await finalizePrompt(true);
		await shutdownClient();
	});
}
