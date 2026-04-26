import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { canTrace, resolveConfig } from "./config.ts";
import {
	getClient,
	type LangfuseSpan,
	shutdownClient,
} from "./langfuse-client.ts";
import {
	EXTENSION_ID,
	getStoredSettingsValues,
	registerSettings,
	type SettingsValues,
	setSettingsValues,
} from "./settings.ts";

interface TraceData {
	id: string;
	update?: (body?: {
		metadata?: Record<string, unknown>;
		output?: unknown;
		input?: unknown;
	}) => void;
}

let currentTrace: TraceData | null = null;
let currentUserPrompt = "";
let currentSessionId = "";
let currentModel = "";
let currentProvider = "";
const activeSpans: Map<string, LangfuseSpan> = new Map();

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
		return;
	}
	console.log("📊 Langfuse: Tracing enabled →", config.host);
}

export default async function (pi: ExtensionAPI) {
	let settings = getStoredSettingsValues(pi);

	const refreshConfig = async () => {
		settings = getStoredSettingsValues(pi);
		registerSettings(pi, getLiveSettingsView(settings));
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

	pi.on("session_start", async (_event, ctx) => {
		const sessionFile = ctx.sessionManager.getSessionFile();
		if (sessionFile) {
			const filename = sessionFile.split("/").pop() || "";
			currentSessionId = filename.replace(".jsonl", "");
		}
	});

	pi.on("model_select", async (event, _ctx) => {
		currentModel = event.model?.id || "";
		currentProvider = event.model?.provider || "";
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const config = resolveConfig(settings);
		if (!canTrace(config)) return;

		try {
			const lf = await getClient(config);
			const eventData = event as typeof event & {
				systemPromptOptions?: { cwd?: string };
			};
			const cwd = eventData.systemPromptOptions?.cwd || process.cwd();
			currentUserPrompt = event.prompt;

			if (!currentModel && ctx.model) {
				currentModel = ctx.model.id || "";
				currentProvider = ctx.model.provider || "";
			}

			currentTrace = lf.trace({
				name: "pi-agent",
				input: event.prompt,
				metadata: {
					cwd,
					model: currentModel,
					provider: currentProvider,
				},
				sessionId: currentSessionId || undefined,
			});
		} catch (e) {
			console.warn("📊 Langfuse: Failed to create trace", e);
		}
	});

	pi.on("agent_end", async (event) => {
		if (currentTrace) {
			const eventData = event as unknown as {
				messages?: Array<{
					role: string;
					content: Array<{ type: string; text?: string; thinking?: string }>;
				}>;
			};
			const messages = eventData.messages || [];
			const lastAssistant = messages
				.filter((m) => m.role === "assistant")
				.pop();

			let output: string | undefined;
			if (lastAssistant?.content) {
				output = lastAssistant.content
					.filter((c) => c.type === "text" && c.text)
					.map((c) => c.text)
					.join("\n");
				if (output.length === 0) output = undefined;
			}

			currentTrace.update?.({
				output: output || undefined,
				metadata: {
					completed: true,
					totalTools: activeSpans.size,
					model: currentModel,
					provider: currentProvider,
				},
			});
			currentTrace = null;
		}
		activeSpans.clear();
		currentUserPrompt = "";
		await shutdownClient();
	});

	pi.on("tool_call", async (event) => {
		if (!currentTrace) return;
		const config = resolveConfig(settings);
		if (!canTrace(config)) return;

		try {
			const lf = await getClient(config);
			let inputStr = "";
			if (event.input) {
				inputStr = JSON.stringify(event.input, null, 2);
				if (inputStr.length > 1000) {
					inputStr = inputStr.slice(0, 1000) + "...";
				}
			}

			const span = lf.span({
				name: `tool:${event.toolName}`,
				traceId: currentTrace.id,
				input: inputStr,
				metadata: { tool: event.toolName },
			});
			activeSpans.set(event.toolCallId, span);
		} catch (e) {
			console.warn("📊 Langfuse: Failed to create span", e);
		}
	});

	pi.on("tool_result", async (event) => {
		const span = activeSpans.get(event.toolCallId);
		if (!span) return;

		let outputStr = "";
		if (event.content && event.content.length > 0) {
			for (const item of event.content) {
				if (item.type === "text" && item.text) {
					outputStr += item.text;
				}
			}
			if (outputStr.length > 2000) {
				outputStr = outputStr.slice(0, 2000) + "...";
			}
		}

		span.end({
			isError: event.isError,
			output: outputStr || undefined,
		});
		activeSpans.delete(event.toolCallId);
	});

	pi.on("turn_end", async (event) => {
		if (!currentTrace) return;
		const config = resolveConfig(settings);
		if (!canTrace(config)) return;

		const eventData = event as unknown as {
			message?: {
				role: string;
				content: Array<{ type: string; text?: string }>;
				model?: string;
				usage?: {
					input: number;
					output: number;
					cacheRead: number;
					cacheWrite: number;
					totalTokens: number;
					cost?: { input: number; output: number; total: number };
				};
			};
		};

		const message = eventData.message;
		if (!message || message.role !== "assistant") return;

		const usage = message.usage;
		const modelId = message.model || currentModel;
		const provider = currentProvider;
		const cost = usage?.cost;

		if (usage) {
			try {
				const lf = await getClient(config);
				let outputText = "";
				if (message.content) {
					outputText = message.content
						.filter((c) => c.type === "text" && c.text)
						.map((c) => c.text)
						.join("\n");
				}

				const gen = lf.generation({
					name: "llm-response",
					traceId: currentTrace.id,
					input: currentUserPrompt.slice(0, 500),
					output: outputText.slice(0, 1000),
					model: modelId,
					metadata: {
						provider,
						inputTokens: usage.input || 0,
						outputTokens: usage.output || 0,
						cachedTokens: usage.cacheRead || 0,
					},
					usage: {
						input: usage.input || 0,
						output: usage.output || 0,
						total:
							usage.totalTokens || (usage.input || 0) + (usage.output || 0),
					},
					costDetails: cost
						? { total: cost.total, input: cost.input, output: cost.output }
						: undefined,
				});
				gen.end({
					costDetails: cost
						? { total: cost.total, input: cost.input, output: cost.output }
						: undefined,
					usage: {
						input: usage.input || 0,
						output: usage.output || 0,
						total:
							usage.totalTokens || (usage.input || 0) + (usage.output || 0),
					},
				});
			} catch (e) {
				console.warn("📊 Langfuse: Failed to create generation", e);
			}

			if (usage.input) {
				const lf = await getClient(config);
				lf.score({
					name: "input_tokens",
					value: usage.input,
					traceId: currentTrace.id,
				});
			}
			if (usage.output) {
				const lf = await getClient(config);
				lf.score({
					name: "output_tokens",
					value: usage.output,
					traceId: currentTrace.id,
				});
			}
			if (cost?.total) {
				const lf = await getClient(config);
				lf.score({
					name: "total_cost",
					value: cost.total,
					traceId: currentTrace.id,
				});
			}
		}
	});

	pi.on("session_shutdown", async () => {
		if (currentTrace) {
			currentTrace.update?.({ metadata: { completed: true } });
			currentTrace = null;
		}
		await shutdownClient();
	});
}
