import { beforeEach, describe, it, vi } from "vitest";
import registerExtension from "./index.js";

type ExtensionArg = Parameters<typeof registerExtension>[0];

describe("index (extension entry)", () => {
	const mockPi = {
		events: {
			on: vi.fn(),
			emit: vi.fn(),
		},
		on: vi.fn(),
		registerCommand: vi.fn(),
		model: { id: "test-model", provider: "test-provider" },
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should update state on session_start", async () => {
		await registerExtension(mockPi as unknown as ExtensionArg);

		// Find the session_start handler
		const sessionStartHandler = mockPi.on.mock.calls.find(
			(call) => call[0] === "session_start",
		)[1];

		const mockCtx = {
			sessionManager: {
				getSessionFile: () => "/path/to/test-session.jsonl",
			},
		};

		await sessionStartHandler({ reason: "test-reason" }, mockCtx);
		// Internal state isn't exported, but we can verify it doesn't throw and
		// we could potentially verify downstream effects if we mocked more.
	});

	it("should update model on model_select", async () => {
		await registerExtension(mockPi as unknown as ExtensionArg);

		const modelSelectHandler = mockPi.on.mock.calls.find(
			(call) => call[0] === "model_select",
		)[1];

		await modelSelectHandler({
			model: { id: "new-model", provider: "new-provider" },
		});
	});
});
