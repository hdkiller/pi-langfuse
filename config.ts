import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SETTINGS, type SettingsValues } from "./settings.js";

export interface Config {
	publicKey: string;
	secretKey: string;
	host: string;
	enabled: boolean;
	userId: string;
	defaultTags: string[];
	release: string;
	environment: string;
	traceInputMaxChars: number;
	traceOutputMaxChars: number;
	toolArgsMaxChars: number;
	toolOutputMaxChars: number;
	captureToolProgress: boolean;
	captureMessageUpdates: boolean;
}

export function loadConfigFile(): Partial<Config> {
	const configPath = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"config.json",
	);

	if (!existsSync(configPath)) {
		return {};
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		return JSON.parse(content) as Partial<Config>;
	} catch (e) {
		console.warn("📊 Langfuse: Failed to load config.json", e);
		return {};
	}
}

function clampNumber(
	value: unknown,
	fallback: number,
	min: number,
	max: number,
) {
	const numeric =
		typeof value === "number"
			? value
			: typeof value === "string" && value.trim()
				? Number(value)
				: Number.NaN;
	if (!Number.isFinite(numeric)) return fallback;
	return Math.min(max, Math.max(min, Math.round(numeric)));
}

function parseTags(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((item) => String(item).trim())
			.filter(Boolean)
			.slice(0, 20);
	}
	if (typeof value !== "string") return [];
	return value
		.split(",")
		.map((tag) => tag.trim())
		.filter(Boolean)
		.slice(0, 20);
}

export function resolveConfig(settings: Partial<SettingsValues>): Config {
	const fileConfig = loadConfigFile() as Partial<Config> &
		Record<string, unknown>;

	return {
		enabled: settings.enabled ?? fileConfig.enabled ?? DEFAULT_SETTINGS.enabled,
		publicKey:
			settings["public-key"] ||
			fileConfig.publicKey ||
			process.env.LANGFUSE_PUBLIC_KEY ||
			"",
		secretKey:
			settings["secret-key"] ||
			fileConfig.secretKey ||
			process.env.LANGFUSE_SECRET_KEY ||
			"",
		host:
			settings["base-url"] ||
			fileConfig.host ||
			process.env.LANGFUSE_BASE_URL ||
			process.env.LANGFUSE_HOST ||
			DEFAULT_SETTINGS["base-url"],
		userId:
			settings["user-id"] ||
			String(
				fileConfig.userId ??
					process.env.PI_LANGFUSE_USER_ID ??
					process.env.LANGFUSE_USER_ID ??
					process.env.USER ??
					process.env.LOGNAME ??
					"",
			),
		defaultTags: parseTags(
			settings["default-tags"] ||
				fileConfig.defaultTags ||
				process.env.PI_LANGFUSE_TAGS ||
				"",
		),
		release:
			settings.release ||
			String(
				fileConfig.release ??
					process.env.LANGFUSE_RELEASE ??
					process.env.PI_LANGFUSE_RELEASE ??
					"",
			),
		environment:
			settings.environment ||
			String(
				fileConfig.environment ??
					process.env.LANGFUSE_ENV ??
					process.env.PI_LANGFUSE_ENV ??
					"",
			),
		traceInputMaxChars: clampNumber(
			settings["trace-input-max-chars"] ?? fileConfig.traceInputMaxChars,
			DEFAULT_SETTINGS["trace-input-max-chars"],
			200,
			20_000,
		),
		traceOutputMaxChars: clampNumber(
			settings["trace-output-max-chars"] ?? fileConfig.traceOutputMaxChars,
			DEFAULT_SETTINGS["trace-output-max-chars"],
			200,
			20_000,
		),
		toolArgsMaxChars: clampNumber(
			settings["tool-args-max-chars"] ?? fileConfig.toolArgsMaxChars,
			DEFAULT_SETTINGS["tool-args-max-chars"],
			100,
			10_000,
		),
		toolOutputMaxChars: clampNumber(
			settings["tool-output-max-chars"] ?? fileConfig.toolOutputMaxChars,
			DEFAULT_SETTINGS["tool-output-max-chars"],
			100,
			20_000,
		),
		captureToolProgress:
			settings["capture-tool-progress"] ??
			(fileConfig.captureToolProgress as boolean | undefined) ??
			DEFAULT_SETTINGS["capture-tool-progress"],
		captureMessageUpdates:
			settings["capture-message-updates"] ??
			(fileConfig.captureMessageUpdates as boolean | undefined) ??
			DEFAULT_SETTINGS["capture-message-updates"],
	};
}

export function canTrace(config: Config): boolean {
	return config.enabled && !!config.publicKey && !!config.secretKey;
}

export function getConfigWarnings(config: Config): string[] {
	const warnings: string[] = [];
	if (!config.enabled) return warnings;
	if (!/^https?:\/\//.test(config.host)) {
		warnings.push("base URL should start with http:// or https://");
	}
	if (config.defaultTags.length >= 20) {
		warnings.push("default tags were capped at 20 entries");
	}
	return warnings;
}
