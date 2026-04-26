import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SETTINGS, type SettingsValues } from "./settings.ts";

export interface Config {
	publicKey: string;
	secretKey: string;
	host: string;
	enabled: boolean;
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

export function resolveConfig(settings: Partial<SettingsValues>): Config {
	const fileConfig = loadConfigFile();

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
	};
}

export function canTrace(config: Config): boolean {
	return config.enabled && !!config.publicKey && !!config.secretKey;
}
