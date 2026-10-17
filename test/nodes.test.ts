import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
	createAnalystNode,
	createAnalystRepairNode,
} from "@src/features/analyst/node.js";
import { createDebateNode } from "@src/features/debate/node.js";
import type { DebateData } from "@src/features/debate/schema.js";
import { createBearSubagent } from "@src/features/debate/subagents/bear/agent.js";
import type { BearCase } from "@src/features/debate/subagents/bear/schema.js";
import { createBullSubagent } from "@src/features/debate/subagents/bull/agent.js";
import type { BullCase } from "@src/features/debate/subagents/bull/schema.js";
import { createDecisionNode } from "@src/features/decision/node.js";
import type { DecisionData } from "@src/features/decision/schema.js";
import { createFinancialsNode } from "@src/features/financials/node.js";
import type { FinancialsData } from "@src/features/financials/schema.js";
import { createMarketNode } from "@src/features/market/node.js";
import type { MarketData } from "@src/features/market/schema.js";
import type { SentimentData } from "@src/features/sentiment/schema.js";
import { createSummaryNode } from "@src/features/summary/node.js";
import { createValidationNode } from "@src/features/validation/node.js";
import type { GraphState } from "@src/workflows/state.js";
import type { AgentTypeConfig, ReactAgent } from "langchain";
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

// The merged valuation + fundamentals artifact. The share price is deliberately
// absent — it belongs to the market agent — and EPS appears once, not twice.
const goodFinancials: FinancialsData = {
	ticker: "AAPL",
	dateChecked: TODAY,
	fiscalPeriod: "TTM",
	trailingEPS: 6.1,
	forwardEPS: 6.8,
	trailingPE: 29.5,
	forwardPE: 26.4,
	pegRatio: 2.1,
	revenueTTM: 400,
	revenueGrowthYoY: 6,
	grossMargin: 46,
	operatingMargin: 31,
	netMargin: 26,
	netIncomeTTM: 100,
	operatingCashFlowTTM: 110,
	freeCashFlowTTM: 100,
	totalDebt: 100,
	cashAndEquivalents: 60,
	netDebt: 40,
	debtToEquity: 145,
	interestCoverage: 28,
	returnOnEquity: 150,
	returnOnAssets: 22,
	insiderTransactions: [],
	sourceUrls: ["https://example.com/financials"],
};

const goodMarket: MarketData = {
	ticker: "AAPL",
	dateChecked: TODAY,
	price: 250,
	priceDate: TODAY,
	trend: "uptrend",
	trendStrength: "moderate",
	sma50: 240,
	sma200: 220,
	ema10: 248,
	rsi14: 58,
	atr14: 4,
	atrPercent: 1.6,
	supportLevels: [240, 220],
	resistanceLevels: [265],
	volumeTrend: "rising",
	signals: [{ indicator: "RSI(14)", reading: "58", interpretation: "i" }],
	sourceUrls: ["https://example.com/market"],
};

const goodBull: BullCase = {
	thesis: "the bull case",
	growthDrivers: [],
	competitiveAdvantages: [],
	positiveIndicators: [],
	riskPosture: "modest risk, funded balance sheet",
	riskPoints: [],
	counterpoints: [],
	confidence: "medium",
};

const goodBear: BearCase = {
	thesis: "the bear case",
	riskFactors: [],
	competitiveWeaknesses: [],
	negativeIndicators: [],
	riskPosture: "elevated risk on a rich multiple",
	riskPoints: [],
	counterpoints: [],
	confidence: "medium",
};

// The orchestrator's artifact: both cases, as the subagents returned them.
const goodDebate: DebateData = { bull: goodBull, bear: goodBear };

// Annotated so the string literals keep their enum types; without this the
// object widens to `string` and fails to satisfy the sentiment schema.
const goodSentiment: SentimentData = {
	ticker: "AAPL",
	dateChecked: TODAY,
	overallSentiment: "neutral",
	sentimentScore: 0.1,
	sentimentConfidence: "medium",
	newsSentimentSources: [],
	newsSentimentSummary: null,
	geopoliticalRisks: [],
	geopoliticalSummary: null,
	sourceUrls: ["https://example.com/news"],
	researchStatus: { news: "complete", geopolitical: "complete" },
};

// Annotated so the string literals keep their enum types; see goodSentiment.
const goodDecision: DecisionData = {
	recommendation: "buy",
	valuationAssessment: "undervalued",
	fairValueEstimate: 250,
	fairValueMethod: "DCF",
	entryPriceRange: { min: 200, max: 220, rationale: "margin of safety" },
	priceTriggers: [],
	executionPlan: {
		entryPrice: 240,
		stopLoss: 228,
		takeProfit: 275,
		positionSizing: "4% of portfolio",
		rationale: "entry near support, stop below the 50-day SMA",
	},
	sentimentAssessment: "positive",
	sentimentScore: 0.2,
	geopoliticalRisk: "low",
	geopoliticalFactors: [],
	keyRisks: [],
	keyUncertainties: [],
	dataDates: {
		financials: TODAY,
		analyst: TODAY,
		sentiment: TODAY,
	},
	sourceUrls: ["https://example.com/decision"],
	disclaimer: "d",
};

function agentReturning(response: unknown): ReactAgent<AgentTypeConfig<never>> {
	return {
		invoke: async () => ({ structuredResponse: response }),
	} as unknown as ReactAgent<AgentTypeConfig<never>>;
}

describe("validation node", () => {
	it("advances to running when every artifact is valid", async () => {
		const node = createValidationNode();

		const update = await node(
			state({
				financials: goodFinancials,
				analyst: goodAnalyst,
				sentiment: goodSentiment,
				market: goodMarket,
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
				financials: goodFinancials,
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
				financials: goodFinancials,
				analyst: undefined,
				sentiment: goodSentiment,
			}),
		);

		expect(update?.validation?.analystIssues.length).toBeGreaterThan(0);
		expect(update?.validation?.financialsIssues).toEqual([]);
	});
});

describe("pass-through nodes", () => {
	it("writes the agent's structured response into state", async () => {
		const node = createFinancialsNode(agentReturning(goodFinancials));

		const update = await node(state());

		expect(update).toEqual({ financials: goodFinancials });
	});

	it("passes the ticker to the financials agent", async () => {
		let seen: unknown;
		const agent = {
			invoke: async (input: unknown) => {
				seen = input;
				return { structuredResponse: goodFinancials };
			},
		} as unknown as ReactAgent<AgentTypeConfig<never>>;

		await createFinancialsNode(agent)(state({ ticker: "MSFT" }));

		expect(JSON.stringify(seen)).toContain("MSFT");
	});

	it("stores a summary node's response", async () => {
		const summary = { ticker: "AAPL", dateChecked: TODAY, summary: "text" };
		const node = createSummaryNode(agentReturning(summary));

		expect(await node(state())).toEqual({ summary });
	});

	it("passes sentiment and the decision into the summary prompt", async () => {
		// The system prompt asks for a Sentiment & geopolitical section and
		// consolidates sourceUrls across the financials, analyst and sentiment
		// inputs — neither is answerable while sentiment is dropped. The
		// decision agent runs first, so the call already exists; passing it is
		// what lets the summary lead with it.
		let seen = "";
		const agent = {
			invoke: async (input: unknown) => {
				seen = JSON.stringify(input);
				return { structuredResponse: null };
			},
		} as unknown as ReactAgent<AgentTypeConfig<never>>;

		await createSummaryNode(agent)(
			state({
				financials: goodFinancials,
				analyst: goodAnalyst,
				sentiment: goodSentiment,
				decision: goodDecision,
			}),
		);

		expect(seen).toContain("FINANCIALS & VALUATION DATA");
		expect(seen).toContain("ANALYST REPORTS");
		expect(seen).toContain("SENTIMENT DATA");
		expect(seen).toContain("DECISION");
		expect(seen).toContain("buy");
		expect(seen).toContain("250");
	});

	it("tells the summary no decision was made rather than passing undefined", async () => {
		// When validation fails the graph routes straight to the summary with
		// no decision in state. Silently omitting the block would read as
		// "nothing to say about the call" and invite the model to invent one.
		let seen = "";
		const agent = {
			invoke: async (input: unknown) => {
				seen = JSON.stringify(input);
				return { structuredResponse: null };
			},
		} as unknown as ReactAgent<AgentTypeConfig<never>>;

		await createSummaryNode(agent)(
			state({
				financials: goodFinancials,
				analyst: goodAnalyst,
				sentiment: goodSentiment,
			}),
		);

		expect(seen).toContain("RECOMMENDATION: NONE");
	});

	it("names a missing artifact rather than stringifying undefined into the prompt", async () => {
		// The summary also runs when validation fails, so an artifact can be
		// absent. Interpolating it would put the literal "undefined" in the
		// prompt — an absence the model reads as a blank finding and fills in.
		let seen = "";
		const agent = {
			invoke: async (input: unknown) => {
				seen = JSON.stringify(input);
				return { structuredResponse: null };
			},
		} as unknown as ReactAgent<AgentTypeConfig<never>>;

		await createSummaryNode(agent)(state({ financials: goodFinancials }));

		expect(seen).toContain("ANALYST REPORTS: not produced in this run");
		expect(seen).toContain("SENTIMENT DATA: not produced in this run");
		expect(seen).not.toContain("undefined");
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
		} as unknown as ReactAgent<AgentTypeConfig<never>>;

		await createDecisionNode(agent)(
			state({
				financials: goodFinancials,
				analyst: goodAnalyst,
				sentiment: goodSentiment,
				market: goodMarket,
				debate: goodDebate,
			}),
		);

		// The decision is only as good as what it was shown. If the
		// financials/analyst keys were dropped from the context object, this
		// is what would catch it.
		const prompt = JSON.stringify(seen);
		expect(prompt).toContain("trailingPE");
		expect(prompt).toContain("Goldman Sachs");
		expect(prompt).toContain("overallSentiment");
		expect(prompt).toContain("the bull case");
		expect(prompt).toContain("the bear case");
	});

	it("stores the analyst node's response", async () => {
		const node = createAnalystNode(agentReturning(goodAnalyst));

		expect(await node(state())).toEqual({ analyst: goodAnalyst });
	});

	it("assigns an undefined structuredResponse rather than throwing", async () => {
		// A model that returns no structured output must not crash the node;
		// the validation node downstream is what turns this into
		// insufficient_data. Worth pinning, because the research nodes all
		// assign structuredResponse unvalidated.
		const node = createFinancialsNode(agentReturning(undefined));

		expect(await node(state())).toEqual({ financials: undefined });
	});

	it("propagates an agent failure to the caller", async () => {
		// These nodes have no try/catch, so a provider error aborts the run
		// rather than being converted into a partial result. LangGraph's
		// retryPolicy is the intended safety net; there is none configured.
		const agent = {
			invoke: async () => {
				throw new Error("provider exploded");
			},
		} as unknown as ReactAgent<AgentTypeConfig<never>>;

		await expect(createFinancialsNode(agent)(state())).rejects.toThrow(
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
		} as unknown as ReactAgent<AgentTypeConfig<never>>;

		const node = createAnalystRepairNode(agent);
		await node(
			state({
				analyst: { ...goodAnalyst, reports: [] },
				validation: {
					pass: false,
					issues: ["no analyst reports returned"],
					analystIssues: ["no analyst reports returned"],
					financialsIssues: [],
					sentimentIssues: [],
					marketIssues: [],
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
					financialsIssues: [],
					sentimentIssues: [],
					marketIssues: [],
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

describe("research nodes", () => {
	it("stores the market agent's response", async () => {
		const node = createMarketNode(agentReturning(goodMarket));

		expect(await node(state())).toEqual({ market: goodMarket });
	});

	it("passes the ticker to the market agent", async () => {
		let seen = "";
		const agent = {
			invoke: async (input: unknown) => {
				seen = JSON.stringify(input);
				return { structuredResponse: goodMarket };
			},
		} as unknown as ReactAgent<AgentTypeConfig<never>>;

		await createMarketNode(agent)(state({ ticker: "MSFT" }));

		expect(seen).toContain("MSFT");
	});

	it("stores the financials agent's response", async () => {
		const node = createFinancialsNode(agentReturning(goodFinancials));

		expect(await node(state())).toEqual({ financials: goodFinancials });
	});
});

describe("debate node", () => {
	it("gives the orchestrator the research dossier and stores both cases", async () => {
		let seen = "";
		const agent = {
			invoke: async (input: unknown) => {
				seen = JSON.stringify(input);
				return { structuredResponse: goodDebate };
			},
		} as unknown as ReactAgent<AgentTypeConfig<never>>;

		const update = await createDebateNode(agent)(
			state({ financials: goodFinancials, market: goodMarket }),
		);

		expect(update).toEqual({ debate: goodDebate });
		expect(seen).toContain("FINANCIALS & VALUATION");
		expect(seen).toContain("TECHNICAL MARKET");
	});

	it("names a missing branch rather than stringifying undefined into the debate prompt", async () => {
		let seen = "";
		const agent = {
			invoke: async (input: unknown) => {
				seen = JSON.stringify(input);
				return { structuredResponse: null };
			},
		} as unknown as ReactAgent<AgentTypeConfig<never>>;

		await createDebateNode(agent)(state());

		expect(seen).toContain("FINANCIALS & VALUATION: not produced in this run");
		expect(seen).not.toContain("undefined");
	});
});

describe("debate subagents", () => {
	// The task tool selects a subagent by name and shows the model its
	// description, so both are part of the delegation contract: a renamed or
	// "description"-less subagent would still run but become unpickable.
	it("exposes the bull and bear as named subagents for the task tool", () => {
		const model = {} as unknown as BaseChatModel;
		const bull = createBullSubagent({ model });
		const bear = createBearSubagent({ model });

		expect(bull.name).toBe("bull");
		expect(bear.name).toBe("bear");
		expect(bull.description.length).toBeGreaterThan(0);
		expect(bear.description.length).toBeGreaterThan(0);
		expect(bull.runnable).toBeDefined();
		expect(bear.runnable).toBeDefined();
	});
});
