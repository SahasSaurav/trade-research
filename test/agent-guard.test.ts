import {
	AGENT_GUARD_CONFIG,
	agentGuardMiddleware,
	MAX_MODEL_CALLS,
} from "@src/workflows/agent-guard.js";
import {
	createAgent,
	FakeToolCallingModel,
	tool,
	toolStrategy,
} from "langchain";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * A React agent is a Pregel graph of its own, so a model that keeps calling a
 * failing tool runs until LangGraph's recursion limit trips. That error is not
 * caught anywhere in this project, so it used to abort the whole workflow
 * instead of letting the validation node report insufficient_data.
 *
 * FakeToolCallingModel is used because the failure needs a model that never
 * stops asking for a tool — spending quota to reproduce it would be absurd.
 */

const noop = tool(() => "ok", {
	name: "noop",
	description: "Does nothing and always succeeds.",
	schema: z.object({}),
});

const replySchema = z.object({ answer: z.string() });

/**
 * A model that only ever emits a tool call, forever. Every entry needs a
 * distinct id: addMessages de-duplicates by id, and a repeated id makes the
 * router believe the model stopped requesting tools, which ends the run early
 * and hides the bug.
 */
function modelThatNeverStops() {
	return new FakeToolCallingModel({
		toolCalls: Array.from({ length: MAX_MODEL_CALLS * 4 }, (_, i) => [
			{ name: "noop", args: {}, id: `call_${i}`, type: "tool_call" as const },
		]),
	});
}

function guardedAgent(model: FakeToolCallingModel) {
	return createAgent({
		model,
		tools: [noop],
		systemPrompt: "test",
		responseFormat: toolStrategy(replySchema),
		middleware: agentGuardMiddleware(),
	}).withConfig(AGENT_GUARD_CONFIG);
}

type AgentResult = { messages: unknown[]; structuredResponse?: unknown };

function countToolResults(messages: unknown[]): number {
	return messages.filter(
		(message) =>
			(message as { _getType?: () => string })._getType?.() === "tool",
	).length;
}

describe("agent guard", () => {
	it("ends a runaway tool loop instead of throwing GraphRecursionError", async () => {
		const agent = guardedAgent(modelThatNeverStops());

		// The regression: this used to reject with GRAPH_RECURSION_LIMIT and
		// take the whole workflow down with it.
		const result = (await agent.invoke({
			messages: [{ role: "user", content: "go" }],
		})) as AgentResult;

		expect(Array.isArray(result.messages)).toBe(true);
	});

	it("stops the loop at the model call budget, not at the recursion limit", async () => {
		// The limit middleware adds before_model and after_model nodes, so each
		// model call costs four supersteps instead of two. If the recursion
		// limit were left at the default 25, the agent would hit it at about
		// six calls and throw before the budget could stop it — the guard
		// would look installed while changing nothing.
		const result = (await guardedAgent(modelThatNeverStops()).invoke({
			messages: [{ role: "user", content: "go" }],
		})) as AgentResult;

		expect(countToolResults(result.messages)).toBe(MAX_MODEL_CALLS);
	});

	it("does not cut off a legitimate tool loop that stays inside the budget", async () => {
		// Three tool calls then a plain answer. The guard has to stay out of the
		// way here, otherwise it would be a cost problem instead of a safety
		// one. FakeToolCallingModel cannot emit a structured response through
		// toolStrategy, so the assertion is on the loop completing on its own.
		const model = new FakeToolCallingModel({
			toolCalls: [
				[{ name: "noop", args: {}, id: "a", type: "tool_call" }],
				[{ name: "noop", args: {}, id: "b", type: "tool_call" }],
				[{ name: "noop", args: {}, id: "c", type: "tool_call" }],
				[],
			],
		});

		const result = (await guardedAgent(model).invoke({
			messages: [{ role: "user", content: "go" }],
		})) as AgentResult;

		expect(countToolResults(result.messages)).toBe(3);
	});
});
