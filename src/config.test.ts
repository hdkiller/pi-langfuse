import * as fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "./config.js";
import { DEFAULT_SETTINGS } from "./settings.js";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: vi.fn(),
		readFileSync: vi.fn(),
	};
});

describe("resolveConfig", () => {
	beforeEach(() => {
		vi.mocked(fs.existsSync).mockReturnValue(false);
		// Clear environment variables that might interfere
		delete process.env.LANGFUSE_PUBLIC_KEY;
		delete process.env.LANGFUSE_SECRET_KEY;
		delete process.env.LANGFUSE_BASE_URL;
		delete process.env.LANGFUSE_HOST;
	});
	it("should use default settings when no input is provided", () => {
		const config = resolveConfig({});
		expect(config.enabled).toBe(DEFAULT_SETTINGS.enabled);
		expect(config.host).toBe(DEFAULT_SETTINGS["base-url"]);
	});

	it("should override defaults with settings", () => {
		const config = resolveConfig({
			enabled: false,
			"base-url": "https://custom.langfuse.com",
		});
		expect(config.enabled).toBe(false);
		expect(config.host).toBe("https://custom.langfuse.com");
	});

	it("should parse tags correctly", () => {
		const config = resolveConfig({
			"default-tags": "tag1, tag2, tag3",
		});
		expect(config.defaultTags).toEqual(["tag1", "tag2", "tag3"]);
	});

	it("should clamp numeric values", () => {
		const config = resolveConfig({
			"trace-input-max-chars": 10, // below min (200)
		});
		expect(config.traceInputMaxChars).toBe(200);

		const config2 = resolveConfig({
			"trace-input-max-chars": 50000, // above max (20000)
		});
		expect(config2.traceInputMaxChars).toBe(20000);
	});
});
