import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.ts";

export interface LangfuseSpan {
	id: string;
	end(body?: {
		metadata?: Record<string, unknown>;
		isError?: boolean;
		output?: unknown;
	}): void;
}

export interface LangfuseGeneration {
	id: string;
	end(body?: {
		metadata?: Record<string, unknown>;
		usage?: unknown;
		output?: unknown;
		costDetails?: unknown;
	}): void;
}

export interface LangfuseClient {
	trace(body?: {
		name: string;
		metadata?: Record<string, unknown>;
		input?: unknown;
		output?: unknown;
		sessionId?: string;
	}): {
		id: string;
		update(body?: {
			metadata?: Record<string, unknown>;
			output?: unknown;
			input?: unknown;
		}): void;
	};
	span(body: {
		name: string;
		traceId: string;
		metadata?: Record<string, unknown>;
		input?: unknown;
	}): LangfuseSpan;
	generation(body: {
		name: string;
		traceId: string;
		metadata?: Record<string, unknown>;
		input?: unknown;
		output?: unknown;
		usage?: unknown;
		model?: string;
		costDetails?: unknown;
	}): LangfuseGeneration;
	score(body: { name: string; value: number; traceId?: string }): void;
	shutdownAsync(): Promise<void>;
}

let client: LangfuseClient | null = null;
let clientConfigKey = "";

export async function shutdownClient() {
	if (client) {
		await client.shutdownAsync();
		client = null;
		clientConfigKey = "";
	}
}

export async function getClient(config: Config): Promise<LangfuseClient> {
	const nextConfigKey = JSON.stringify({
		publicKey: config.publicKey,
		secretKey: config.secretKey,
		host: config.host,
	});

	if (client && clientConfigKey !== nextConfigKey) {
		await shutdownClient();
	}

	if (!client) {
		const extDir = resolve(dirname(fileURLToPath(import.meta.url)));
		const lib = (await import(
			`${extDir}/node_modules/langfuse/lib/index.mjs`
		)) as {
			Langfuse: new (options: {
				publicKey: string;
				secretKey?: string;
				baseUrl?: string;
			}) => LangfuseClient;
		};
		client = new lib.Langfuse({
			publicKey: config.publicKey,
			secretKey: config.secretKey,
			baseUrl: config.host,
		});
		clientConfigKey = nextConfigKey;
	}

	return client;
}
