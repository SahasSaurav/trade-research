import type { BaseMessageLike } from "@langchain/core/messages";

/**
 * The one thing a graph node needs from an agent: invoke with messages, then read
 * the structured result. `createAgent` and `createDeepAgent` both satisfy it, but
 * their typed `ReactAgent` variants are not mutually assignable — the
 * context-schema generic differs — so the graph depends on this structural
 * contract instead of a shared (or widened) `ReactAgent`.
 *
 * Parameterised by the structured-response type so each node keeps its artifact
 * type: `AgentRunnable<ValuationData>`, not `unknown`.
 */
type AgentRunnable<T> = {
	invoke(input: {
		messages: BaseMessageLike[];
	}): Promise<{ structuredResponse?: T }>;
};

export type { AgentRunnable };
