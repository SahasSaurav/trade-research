import {
	createAnalystNode,
	createAnalystRepairNode,
} from "@src/features/analyst/node.js";
import { createDecisionNode } from "@src/features/decision/node.js";
import type { SentimentData } from "@src/features/sentiment/schema.js";
import { createSummaryNode } from "@src/features/summary/node.js";
import { createValidationNode } from "@src/features/validation/node.js";
import { createValuationNode } from "@src/features/valuation/node.js";
import type { GraphState } from "@src/workflows/state.js";
import type { ReactAgent } from "langchain";
import { describe, expect, it } from "vitest";

type State = GraphState;

const TODAY = new Date().toISOString().slice(0, 10);

/** A node takes the full state shape but only reads a few fields. */
function state(overrides: Partial<State> = {}): State {
	return {
		ticker: "AAPL",
		analystAttempts: 0,
		validationIssues: [],
		workflowStatus: "running",
		...overrides,
	} as State;
}

const goodAnalyst = {
	ticker: "AAPL",
	dateChecked: TODAY,
	reports: [
		{
			firm: "Goldman Sachs",
			reportTitle: "Initiation",
			rating: "Buy",
			priceTarget: 250,
			reportDate: TODAY,
			sourceUrl: "https://example.com/gs",
			summary: "s",
		},
	],
};

const goodValuation = {
	ticker: "AAPL",
	dateChecked: TODAY,
	trailingEPS: 6.1,
	forwardEPS: 6.8,
	trailingPE: 29.5,
	forwardPE: 26.4,
	pegRatio: 2.1,
	sourceUrls: ["https://example.com/10-k"],
};

// Annotated so the string literals keep their enum types; without this the
// object widens to `string` and fails to satisfy the sentiment schema.
const goodSentiment: SentimentData = {
	ticker: "AAPL",
	overallSentiment: "neutral",
	sentimentScore: 0.1,
	sentimentSources: [],
	geopoliticalRisks: [],
	geopoliticalSummary: null,
	researchStatus: { news: "complete", geopolitical: "complete" },
	researchErrors: [],
	dateChecked: TODAY,
	sourceUrls: ["https://example.com/news"],
	notes: null,
};

function agentReturning(response: unknown) {
	return {
		invoke: async () => ({ structuredResponse: response }),
	} as unknown as ReactAgent;
}

describe("validation node", () => {
	it("advances to running when every artifact is valid", async () => {
		const node = createValidationNode();

		const update = await node(
			state({
				valuation: goodValuation,
				analyst: goodAnalyst,
				sentiment: goodSentiment,
			}),
		);

		expect(update).toMatchObject({
			workflowStatus: "running",
			validationIssues: [],
		});
		expect(update?.validation?.pass).toBe(true);
	});

	it("halts to insufficient_data when an artifact is invalid", async () => {
		const node = createValidationNode();

		const update = await node(
			state({
				valuation: goodValuation,
				analyst: undefined,
				sentiment: goodSentiment,
			}),
		);

		// The graph routes insufficient_data straight to the summary node, so
		// the run ends with an explanation rather than a decision.
		expect(update?.workflowStatus).toBe("insufficient_data");
		expect(update?.validationIssues.length).toBeGreaterThan(0);
	});

	it("keeps analyst issues separate so only the analyst is retried", async () => {
		const node = createValidationNode();

		const update = await node(
			state({
				valuation: goodValuation,
				analyst: undefined,
				sentiment: goodSentiment,
			}),
		);

		expect(update?.validation?.analystIssues.length).toBeGreaterThan(0);
		expect(update?.validation?.valuationIssues).toEqual([]);
	});
});

describe("pass-through nodes", () => {
	it("writes the agent's structured response into state", async () => {
		const node = createValuationNode(agentReturning(goodValuation));

		const update = await node(state());

		expect(update).toEqual({ valuation: goodValuation });
	});

	it("passes the ticker to the valuation agent", async () => {
		let seen: unknown;
		const agent = {
			invoke: async (input: unknown) => {
				seen = input;
				return { structuredResponse: goodValuation };
			},
		} as unknown as ReactAgent;

		await createValuationNode(agent)(state({ ticker: "MSFT" }));

		expect(JSON.stringify(seen)).toContain("MSFT");
	});

	it("stores a summary node's response", async () => {
		const summary = { ticker: "AAPL", dateChecked: TODAY, summary: "text" };
		const node = createSummaryNode(agentReturning(summary));

		expect(await node(state())).toEqual({ summary });
	});

	it("BUG: the summary prompt never receives sentiment data", async () => {
		// summary/node.ts calls
		//   SUMMARY_USER_MESSAGE(state.ticker, state.valuation, state.analyst)
		// while the signature is (ticker, valuation, analyst, sentiment?),
		// so sentiment is silently dropped. The prompt only appends a
		// SENTIMENT DATA block when that fourth argument is truthy.
		//
		// The system prompt then asks for a "Convergence & conflict"
		// paragraph spanning valuation, sentiment *and* analyst views, which
		// the model cannot answer without sentiment. It also says to
		// consolidate sourceUrls "from the valuation, analyst, and sentiment
		// inputs", so sentiment URLs are missing from the output too.
		//
		// Pinned as-is: the fix is one argument, but it changes model input,
		// so it belongs in its own commit.
		let seen = "";
		const agent = {
			invoke: async (input: unknown) => {
				seen = JSON.stringify(input);
				return { structuredResponse: null };
			},
		} as unknown as ReactAgent;

		await createSummaryNode(agent)(
			state({
				valuation: goodValuation,
				analyst: goodAnalyst,
				sentiment: goodSentiment,
			}),
		);

		expect(seen).toContain("VALUATION DATA");
		expect(seen).toContain("ANALYST REPORTS");
		expect(seen).not.toContain("SENTIMENT DATA");
	});

	it("stores a decision node's response and marks the run complete", async () => {
		const decision = { recommendation: "hold" };
		const node = createDecisionNode(agentReturning(decision));

		// graph.ts routes on workflowStatus: "complete" ends the run,
		// anything else falls through to the summary node.
		expect(await node(state())).toEqual({
			decision,
			workflowStatus: "complete",
		});
	});

	it("gives the decision agent the upstream artifacts as context", async () => {
		let seen: unknown;
		const agent = {
			invoke: async (input: unknown) => {
				seen = input;
				return { structuredResponse: { recommendation: "hold" } };
			},
		} as unknown as ReactAgent;

		await createDecisionNode(agent)(
			state({
				valuation: goodValuation,
				analyst: goodAnalyst,
				sentiment: goodSentiment,
			}),
		);

		// The decision is only as good as what it was shown. If the
		// valuation/analyst keys were dropped from the context object, this
		// is what would catch it.
		const prompt = JSON.stringify(seen);
		expect(prompt).toContain("trailingPE");
		expect(prompt).toContain("Goldman Sachs");
		expect(prompt).toContain("overallSentiment");
	});

	it("stores the analyst node's response", async () => {
		const node = createAnalystNode(agentReturning(goodAnalyst));

		expect(await node(state())).toEqual({ analyst: goodAnalyst });
	});

	it("assigns an undefined structuredResponse rather than throwing", async () => {
		// A model that returns no structured output must not crash the node;
		// the validation node downstream is what turns this into
		// insufficient_data. Worth pinning, because the four non-sentiment
		// nodes all assign structuredResponse unvalidated.
		const node = createValuationNode(agentReturning(undefined));

		expect(await node(state())).toEqual({ valuation: undefined });
	});

	it("propagates an agent failure to the caller", async () => {
		// These nodes have no try/catch, so a provider error aborts the run
		// rather than being converted into a partial result. LangGraph's
		// retryPolicy is the intended safety net; there is none configured.
		const agent = {
			invoke: async () => {
				throw new Error("provider exploded");
			},
		} as unknown as ReactAgent;

		await expect(createValuationNode(agent)(state())).rejects.toThrow(
			"provider exploded",
		);
	});
});

describe("analyst repair node", () => {
	it("sends the validation issues back to the analyst", async () => {
		let seen: unknown;
		const agent = {
			invoke: async (input: unknown) => {
				seen = input;
				return { structuredResponse: goodAnalyst };
			},
		} as unknown as ReactAgent;

		const node = createAnalystRepairNode(agent);
		await node(
			state({
				analyst: { ...goodAnalyst, reports: [] },
				validation: {
					pass: false,
					issues: ["no analyst reports returned"],
					analystIssues: ["no analyst reports returned"],
					valuationIssues: [],
					sentimentIssues: [],
				},
			}),
		);

		expect(JSON.stringify(seen)).toContain("no analyst reports returned");
	});

	it("returns a fresh analyst payload and counts the attempt", async () => {
		const node = createAnalystRepairNode(agentReturning(goodAnalyst));

		const update = await node(
			state({
				analystAttempts: 1,
				validation: {
					pass: false,
					issues: ["x"],
					analystIssues: ["x"],
					valuationIssues: [],
					sentimentIssues: [],
				},
			}),
		);

		// graph.ts caps repair at MAX_ANALYST_ATTEMPTS = 2, so this counter
		// is what eventually stops the loop. If it stopped incrementing,
		// the graph would repair forever.
		expect(update).toEqual({ analyst: goodAnalyst, analystAttempts: 2 });
	});

	it("starts the attempt counter from zero when it was never set", async () => {
		const node = createAnalystRepairNode(agentReturning(goodAnalyst));

		const update = await node(state({ analystAttempts: undefined }));

		expect(update?.analystAttempts).toBe(1);
	});

	it("tolerates a missing validation result", async () => {
		// The repair node reads state.validation?.analystIssues ?? []. If the
		// optional chain were dropped this would throw instead.
		const node = createAnalystRepairNode(agentReturning(goodAnalyst));

		const update = await node(state({ validation: undefined }));

		expect(update?.analyst).toEqual(goodAnalyst);
	});
});
