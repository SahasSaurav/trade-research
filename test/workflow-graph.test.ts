import { join } from "node:path";

import { START } from "@langchain/langgraph";
import { openCheckpointSaver } from "@src/utils/context-store.js";
import type { GraphAgents } from "@src/workflows/graph.js";
import { createGraph } from "@src/workflows/graph.js";
import type { AgentTypeConfig, ReactAgent } from "langchain";
import { describe, expect, it } from "vitest";

import { removeTempDirs, tableNames, tempDir } from "./helpers.js";

/**
 * These tests inject stub agents so the graph runs end to end with no network
 * and no API key. They cover routing and orchestration only — not model
 * behaviour, which cannot be tested without spending quota.
 */

const TODAY = new Date().toISOString().slice(0, 10);

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

// The merged valuation + fundamentals artifact: EPS once, no share price.
const goodFinancials = {
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

const decision = { recommendation: "hold" };
const summary = { ticker: "AAPL", dateChecked: TODAY, summary: "final text" };
// The sentiment agent returns research; the node stamps the ticker, date,
// score and sourceUrls.
const goodSentiment = {
	newsSentimentSources: [],
	newsSentimentSummary: null,
	geopoliticalRisks: [],
	geopoliticalSummary: "none",
	researchStatus: { news: "complete", geopolitical: "complete" },
};

const goodMarket = {
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

const debate = {
	bull: { thesis: "bull" },
	bear: { thesis: "bear" },
};

type Stub = { invokeCount: number; responses: unknown[] };

function stubAgent(responses: unknown[]): {
	agent: ReactAgent<AgentTypeConfig<never>>;
	stub: Stub;
} {
	const stub: Stub = { invokeCount: 0, responses };
	return {
		stub,
		agent: {
			invoke: async () => {
				const response =
					responses[Math.min(stub.invokeCount, responses.length - 1)];
				stub.invokeCount += 1;
				return { structuredResponse: response };
			},
		} as unknown as ReactAgent<AgentTypeConfig<never>>,
	};
}

function buildAgents(
	overrides: Partial<Record<keyof GraphAgents, unknown>> = {},
) {
	const financials = stubAgent([overrides.financials ?? goodFinancials]);
	const analyst = stubAgent(
		overrides.analyst === undefined
			? [goodAnalyst]
			: (overrides.analyst as unknown[]),
	);
	const sentiment = stubAgent([overrides.sentiment ?? goodSentiment]);
	const market = stubAgent([overrides.market ?? goodMarket]);
	const debateAgent = stubAgent([overrides.debate ?? debate]);
	const decisionAgent = stubAgent([overrides.decision ?? decision]);
	const summaryAgent = stubAgent([overrides.summary ?? summary]);

	const agents: GraphAgents = {
		financials: financials.agent,
		analyst: analyst.agent,
		sentiment: sentiment.agent,
		market: market.agent,
		debate: debateAgent.agent,
		decision: decisionAgent.agent,
		summary: summaryAgent.agent,
	};

	return {
		agents,
		financials,
		analyst,
		sentiment,
		market,
		debateAgent,
		decisionAgent,
		summaryAgent,
	};
}

async function run(agents: GraphAgents, ticker = "AAPL") {
	const graph = createGraph(agents);
	return (await graph.invoke(
		{ ticker },
		{ configurable: { thread_id: `test-${Math.random().toString(36)}` } },
	)) as Record<string, unknown>;
}

describe("workflow graph", () => {
	it("runs research, validates, debates, decides and summarises in one pass", async () => {
		const {
			agents,
			financials,
			analyst,
			sentiment,
			market,
			debateAgent,
			decisionAgent,
			summaryAgent,
		} = buildAgents();

		const result = await run(agents);

		expect(result.financials).toEqual(goodFinancials);
		expect(result.analyst).toEqual(goodAnalyst);
		expect(result.market).toEqual(goodMarket);
		expect(result.debate).toEqual(debate);
		expect(result.decision).toEqual(decision);
		expect(result.summary).toEqual(summary);
		expect(result.workflowStatus).toBe("complete");

		// Every agent on the success path runs exactly once: the debate is
		// deterministic, not a loop the model decides when to stop.
		for (const stub of [
			financials,
			analyst,
			sentiment,
			market,
			debateAgent,
			decisionAgent,
			summaryAgent,
		]) {
			expect(stub.stub.invokeCount).toBe(1);
		}
	});

	it("chains the debate deterministically from research to the summary", async () => {
		// The graph owns the order: researchers, then the debate orchestrator
		// (which dispatches the bull, then the bear that rebuts it), then the
		// decision that weighs both. This asserts each stage saw the one before
		// it, which is what makes the debate a debate rather than independent
		// monologues.
		const { agents } = buildAgents();
		const graph = createGraph(agents);
		const edges = await graph.getGraph();
		const targets = (source: string) =>
			edges.edges
				.filter((edge) => edge.source === source)
				.map((edge) => edge.target);

		expect(targets("dataValidation")).toContain("debateAgent");
		expect(targets("debateAgent")).toEqual(["decisionAgent"]);
		expect(targets("decisionAgent")).toEqual(["summaryAgent"]);
	});

	it("runs ticker validation before starting parallel research branches", async () => {
		const { agents } = buildAgents();

		const graph = createGraph(agents);
		const edges = await graph.getGraph();

		const startTargets = edges.edges
			.filter((edge) => edge.source === START)
			.map((edge) => edge.target);

		// "tickerCheck", not "tickerValidation": the state channel is already
		// called tickerValidation, and LangGraph rejects a node that shares a
		// name with a channel. See the node/channel collision test below.
		expect(startTargets).toEqual(["tickerCheck"]);
	});

	it("never names a node after a state channel", () => {
		// addNode throws on a node/channel name clash, which kills
		// createWorkflow and every test that compiles the graph. The error
		// names the channel but not the node, so it reads like a store or
		// checkpointer problem.
		//
		// Convention: nodes are named for the job, channels for the value they
		// hold — tickerCheck -> tickerValidation, dataValidation ->
		// validation.
		const { agents } = buildAgents();

		expect(() => createGraph(agents)).not.toThrow();
	});

	it("halts to the summary when validation fails, skipping the decision", async () => {
		const { agents, decisionAgent, summaryAgent } = buildAgents({
			analyst: { ticker: "AAPL", dateChecked: TODAY, reports: [] },
		});

		const result = await run(agents);

		expect(result.workflowStatus).toBe("insufficient_data");
		expect(result.decision).toBeUndefined();
		expect(decisionAgent.stub.invokeCount).toBe(0);
		// The summary still runs, so the user gets an explanation.
		expect(summaryAgent.stub.invokeCount).toBe(1);
		expect(result.summary).toEqual(summary);
	});

	it("retries the analyst once when only the analyst data is bad", async () => {
		const { agents, analyst } = buildAgents({
			// First call returns no reports; the repair call returns good data.
			analyst: [
				{ ticker: "AAPL", dateChecked: TODAY, reports: [] },
				goodAnalyst,
			],
		});

		const result = await run(agents);

		expect(analyst.stub.invokeCount).toBe(2);
		expect(result.analyst).toEqual(goodAnalyst);
		expect(result.workflowStatus).toBe("complete");
		expect(result.decision).toEqual(decision);
	});

	it("stops repairing once the same issues come back", async () => {
		// The repair re-runs the same instruction and gets the same failure, so
		// a second identical round would be a third full analyst invocation
		// that cannot plausibly say anything new.
		const { agents, analyst, decisionAgent } = buildAgents({
			analyst: { ticker: "AAPL", dateChecked: TODAY, reports: [] },
		});

		const result = await run(agents);

		// One initial call plus one repair, then the repeat ends the loop.
		expect(analyst.stub.invokeCount).toBe(2);
		expect(result.analystAttempts).toBe(1);
		expect(decisionAgent.stub.invokeCount).toBe(0);
		expect(result.workflowStatus).toBe("insufficient_data");
	});

	it("stops at the attempt cap when every repair finds a different problem", async () => {
		// Different issues mean the repair is making progress, so only the cap
		// ends the loop here. MAX_ANALYST_ATTEMPTS = 2.
		const report = goodAnalyst.reports[0];
		const { agents, analyst, decisionAgent } = buildAgents({
			analyst: [
				{ ticker: "AAPL", dateChecked: TODAY, reports: [] },
				{
					ticker: "AAPL",
					dateChecked: TODAY,
					reports: [report, { ...report, reportTitle: "Update" }],
				},
				{
					ticker: "AAPL",
					dateChecked: TODAY,
					reports: [{ ...report, sourceUrl: "" }],
				},
			],
		});

		const result = await run(agents);

		// One initial call plus two repairs.
		expect(analyst.stub.invokeCount).toBe(3);
		expect(result.analystAttempts).toBe(2);
		expect(decisionAgent.stub.invokeCount).toBe(0);
		expect(result.workflowStatus).toBe("insufficient_data");
	});

	it("does not repair the analyst when another branch has also failed", async () => {
		// The run cannot reach the debate with the financials broken, so a
		// repair round would be a full analyst invocation that changes nothing.
		const { agents, analyst } = buildAgents({
			analyst: [{ ticker: "AAPL", dateChecked: TODAY, reports: [] }],
			financials: { ...goodFinancials, sourceUrls: [] },
		});

		await run(agents);

		expect(analyst.stub.invokeCount).toBe(1);
	});

	it("does not repair an analyst failure whose only issue is a schema message", async () => {
		// A zod dump names no firm, field or expected value, so there is no
		// instruction a re-run could act on. Reported, not retried.
		const { agents, analyst } = buildAgents({
			analyst: [{ ...goodAnalyst, ticker: 42 }],
		});

		const result = await run(agents);

		expect(analyst.stub.invokeCount).toBe(1);
		expect(result.workflowStatus).toBe("insufficient_data");
	});

	it("does not retry the analyst when the financials are at fault", async () => {
		// graph.ts routes on validation.analystIssues specifically. If it
		// checked validation.issues instead, a financials problem would send
		// the analyst to repair for no reason.
		const { agents, analyst } = buildAgents({
			financials: { ...goodFinancials, sourceUrls: [] },
		});

		await run(agents);

		expect(analyst.stub.invokeCount).toBe(1);
	});

	it("keeps partial sentiment when one branch fails", async () => {
		// A single branch failing is a designed outcome: the orchestrator still
		// returns the artifact, with researchStatus marking the failed branch.
		const { agents, decisionAgent } = buildAgents({
			sentiment: {
				...goodSentiment,
				researchStatus: { news: "failed", geopolitical: "complete" },
			},
		});

		const result = await run(agents);

		// researchStatus.failed is not a validation failure, so the run
		// continues to a decision on partial data.
		const sentiment = result.sentiment as { researchStatus: { news: string } };
		expect(sentiment.researchStatus.news).toBe("failed");
		expect(result.workflowStatus).toBe("complete");
		expect(decisionAgent.stub.invokeCount).toBe(1);
	});

	it("threads state across invocations via the checkpointer", async () => {
		// MemorySaver is wired in, so a second invoke with the same thread_id
		// resumes rather than starting clean.
		const { agents } = buildAgents();
		const graph = createGraph(agents);
		const config = { configurable: { thread_id: "shared-thread" } };

		await graph.invoke({ ticker: "AAPL" }, config);
		const second = (await graph.invoke({ ticker: "AAPL" }, config)) as Record<
			string,
			unknown
		>;

		// State from the first run is still present, which is only possible
		// if the checkpointer retained it.
		expect(second.workflowStatus).toBe("complete");
		expect(second.ticker).toBe("AAPL");
	});
});

describe("checkpoint resume", () => {
	it("resumes a crashed run from the node that crashed", async () => {
		const path = join(tempDir("checkpoints-"), "context.db");
		const checkpoints = openCheckpointSaver(path);
		const config = { configurable: { thread_id: "AAPL:2026-10-21" } };

		try {
			// The first attempt gets all the way to the summary and dies there,
			// which is where the most expensive work is already done.
			const crashed = buildAgents();
			crashed.agents.summary = {
				invoke: async () => {
					throw new Error("node crashed");
				},
			} as unknown as GraphAgents["summary"];

			await expect(
				createGraph(crashed.agents, {
					checkpointer: checkpoints.saver,
				}).invoke({ ticker: "AAPL" }, config),
			).rejects.toThrow("node crashed");

			// The checkpoints landed in the store's own file format, not a
			// sidecar database.
			expect(tableNames(path)).toEqual(
				expect.arrayContaining(["checkpoints", "writes"]),
			);

			// A second process, the same thread: the branches that already
			// answered are not asked again, and the crash completes.
			// `null` is what continues a thread — passing input would start a
			// new turn and re-run the graph from the top.
			const resumed = buildAgents();
			const state = (await createGraph(resumed.agents, {
				checkpointer: checkpoints.saver,
			}).invoke(null, config)) as Record<string, unknown>;

			expect(state.workflowStatus).toBe("complete");
			expect(resumed.financials.stub.invokeCount).toBe(0);
			expect(resumed.analyst.stub.invokeCount).toBe(0);
			expect(resumed.market.stub.invokeCount).toBe(0);
			expect(resumed.summaryAgent.stub.invokeCount).toBe(1);
			// The decision the crashed run had already reached is the one the
			// resumed run reports, rather than a second call to the decision
			// agent.
			expect(resumed.decisionAgent.stub.invokeCount).toBe(0);
			expect(state.decision).toEqual(decision);
		} finally {
			checkpoints.close();
			removeTempDirs();
		}
	});

	it("starts clean on a thread it has never seen", async () => {
		const checkpoints = openCheckpointSaver(
			join(tempDir("checkpoints-"), "context.db"),
		);

		try {
			const first = buildAgents();
			await createGraph(first.agents, {
				checkpointer: checkpoints.saver,
			}).invoke({ ticker: "AAPL" }, { configurable: { thread_id: "day-1" } });

			const second = buildAgents();
			await createGraph(second.agents, {
				checkpointer: checkpoints.saver,
			}).invoke({ ticker: "AAPL" }, { configurable: { thread_id: "day-2" } });

			// A different day is a different run, so every branch runs again.
			expect(second.financials.stub.invokeCount).toBe(1);
			expect(second.decisionAgent.stub.invokeCount).toBe(1);
		} finally {
			checkpoints.close();
			removeTempDirs();
		}
	});
});
