import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export const EXTENSION_ID = "pi-langfuse-extension";
const SETTINGS_FILE = join(homedir(), ".pi", "agent", "settings.json");
const EXTENSIONS_SETTINGS_KEY = "extensions:settings";

export interface SettingsValues {
	enabled: boolean;
	"public-key": string;
	"secret-key": string;
	"base-url": string;
}

export const DEFAULT_SETTINGS: SettingsValues = {
	enabled: true,
	"public-key": "",
	"secret-key": "",
	"base-url": "https://cloud.langfuse.com",
};

export const SETTINGS_DOCUMENTATION = `# Langfuse settings

These settings control how the Langfuse extension connects to your Langfuse project.

## Notes

- Settings entered here are stored in plain text by pi-extension-settings.
- If you prefer not to store keys here, keep using config.json or environment variables.
- Resolution order is: settings panel -> config.json -> environment variables -> defaults.
- When a setting is empty, this panel shows the live fallback value currently resolved from config.json, environment variables, or built-in defaults.
`;

export function createSettingsNodes(defaults: SettingsValues) {
	return {
		enabled: {
			_tag: "boolean",
			label: "Enabled",
			description: "Enable Langfuse tracing.",
			default: defaults.enabled,
		},
		"public-key": {
			_tag: "text",
			label: "Public Key",
			description:
				"Langfuse public key. Empty means use config.json/env fallback shown here.",
			default: defaults["public-key"],
		},
		"secret-key": {
			_tag: "text",
			label: "Secret Key",
			description:
				"Langfuse secret key. Empty means use config.json/env fallback shown here.",
			default: defaults["secret-key"],
		},
		"base-url": {
			_tag: "text",
			label: "Base URL",
			description:
				"Langfuse base URL. Empty means use config.json/env fallback shown here.",
			default: defaults["base-url"],
		},
	} as const;
}

function loadSettingsFile(): Record<string, Record<string, unknown>> {
	if (!existsSync(SETTINGS_FILE)) return {};
	try {
		const parsed = JSON.parse(readFileSync(SETTINGS_FILE, "utf-8")) as Record<
			string,
			unknown
		>;
		const extensionSettings = parsed[EXTENSIONS_SETTINGS_KEY];
		return typeof extensionSettings === "object" && extensionSettings !== null
			? (extensionSettings as Record<string, Record<string, unknown>>)
			: {};
	} catch {
		return {};
	}
}

function saveSettingsFile(values: Record<string, Record<string, unknown>>) {
	const dir = dirname(SETTINGS_FILE);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	let fullContent: Record<string, unknown> = {};
	if (existsSync(SETTINGS_FILE)) {
		try {
			fullContent = JSON.parse(readFileSync(SETTINGS_FILE, "utf-8")) as Record<
				string,
				unknown
			>;
		} catch {
			fullContent = {};
		}
	}

	fullContent[EXTENSIONS_SETTINGS_KEY] = values;
	writeFileSync(
		SETTINGS_FILE,
		`${JSON.stringify(fullContent, null, 2)}\n`,
		"utf-8",
	);
}

export function getStoredSettingsValues(
	pi?: ExtensionAPI,
): Partial<SettingsValues> {
	const probe = { id: EXTENSION_ID, values: undefined as unknown };
	if (pi) {
		pi.events.emit("extension:settings:get", probe);
		if (probe.values && typeof probe.values === "object") {
			return probe.values as Partial<SettingsValues>;
		}
	}

	const allValues = loadSettingsFile();
	return (allValues[EXTENSION_ID] ?? {}) as Partial<SettingsValues>;
}

export function getSettingsValues(pi?: ExtensionAPI): SettingsValues {
	const values = getStoredSettingsValues(pi);
	return {
		enabled: values.enabled ?? DEFAULT_SETTINGS.enabled,
		"public-key": values["public-key"] ?? DEFAULT_SETTINGS["public-key"],
		"secret-key": values["secret-key"] ?? DEFAULT_SETTINGS["secret-key"],
		"base-url": values["base-url"] ?? DEFAULT_SETTINGS["base-url"],
	};
}

export function setSettingsValues(nextValues: Partial<SettingsValues>) {
	const allValues = loadSettingsFile();
	allValues[EXTENSION_ID] = {
		...(allValues[EXTENSION_ID] ?? {}),
		...nextValues,
	};
	saveSettingsFile(allValues);
}

export function registerSettings(
	pi: ExtensionAPI,
	defaults: SettingsValues = DEFAULT_SETTINGS,
) {
	pi.events.emit("pi-extension-settings:register", {
		extension: EXTENSION_ID,
		nodes: createSettingsNodes(defaults),
		documentation: SETTINGS_DOCUMENTATION,
	});
}
