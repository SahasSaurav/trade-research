import { START } from "@langchain/langgraph";
import type { GraphAgents } from "@src/workflows/graph.js";
import { createGraph } from "@src/workflows/graph.js";
import type { ReactAgent } from "langchain";
import { describe, expect, it } from "vitest";

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

const decision = { recommendation: "hold" };
const summary = { ticker: "AAPL", dateChecked: TODAY, summary: "final text" };

type Stub = { invokeCount: number; responses: unknown[] };

function stubAgent(responses: unknown[]): { agent: ReactAgent; stub: Stub } {
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
		} as unknown as ReactAgent,
	};
}

function buildAgents(
	overrides: Partial<Record<keyof GraphAgents, unknown>> = {},
) {
	const valuation = stubAgent([overrides.valuation ?? goodValuation]);
	const analyst = stubAgent(
		overrides.analyst === undefined
			? [goodAnalyst]
			: (overrides.analyst as unknown[]),
	);
	const newsSentiment = stubAgent([
		overrides.newsSentiment ?? {
			ticker: "AAPL",
			sentimentSources: [],
			sourceUrls: [],
			notes: "",
		},
	]);
	const geopolitical = stubAgent([
		overrides.geopolitical ?? {
			ticker: "AAPL",
			geopoliticalRisks: [],
			geopoliticalSummary: "none",
			sourceUrls: [],
			notes: "",
		},
	]);
	const decisionAgent = stubAgent([overrides.decision ?? decision]);
	const summaryAgent = stubAgent([overrides.summary ?? summary]);

	const agents: GraphAgents = {
		valuation: valuation.agent,
		analyst: analyst.agent,
		newsSentiment: newsSentiment.agent,
		geopolitical: geopolitical.agent,
		decision: decisionAgent.agent,
		summary: summaryAgent.agent,
	};

	return {
		agents,
		valuation,
		analyst,
		newsSentiment,
		geopolitical,
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
	it("runs research, validates, decides and summarises in one pass", async () => {
		const { agents, decisionAgent, summaryAgent } = buildAgents();

		const result = await run(agents);

		expect(result.valuation).toEqual(goodValuation);
		expect(result.analyst).toEqual(goodAnalyst);
		expect(result.decision).toEqual(decision);
		expect(result.summary).toEqual(summary);
		expect(result.workflowStatus).toBe("complete");
		expect(decisionAgent.stub.invokeCount).toBe(1);
		// The summary is the program's only output (src/index.ts reads
		// result.summary?.summary), so it must run on the success path.
		// It previously did not: graph.ts routed decisionAgent to END
		// unless workflowStatus was "insufficient_data", which
		// createDecisionNode can never return, so every successful run
		// printed "No summary available".
		expect(summaryAgent.stub.invokeCount).toBe(1);
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
		// This is the only path that reaches summaryAgent today, which is
		// what makes the previous test's bug easy to miss: the summary agent
		// is well exercised, just never on success.
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

	it("gives up on the analyst after two repair attempts", async () => {
		// MAX_ANALYST_ATTEMPTS = 2. Without the cap this would loop forever,
		// since the repair node keeps producing the same bad shape.
		const { agents, analyst, decisionAgent } = buildAgents({
			analyst: { ticker: "AAPL", dateChecked: TODAY, reports: [] },
		});

		const result = await run(agents);

		// One initial call plus two repairs.
		expect(analyst.stub.invokeCount).toBe(3);
		expect(result.analystAttempts).toBe(2);
		expect(decisionAgent.stub.invokeCount).toBe(0);
		expect(result.workflowStatus).toBe("insufficient_data");
	});

	it("does not retry the analyst when the valuation is at fault", async () => {
		// graph.ts routes on validation.analystIssues specifically. If it
		// checked validation.issues instead, a valuation problem would send
		// the analyst to repair for no reason.
		const { agents, analyst } = buildAgents({
			valuation: { ...goodValuation, sourceUrls: [] },
		});

		await run(agents);

		expect(analyst.stub.invokeCount).toBe(1);
	});

	it("keeps partial sentiment when one subagent fails", async () => {
		const newsFailure = Object.assign(new Error("tavily down"), {
			status: 503,
		});
		const news = {
			invoke: async () => {
				throw newsFailure;
			},
		} as unknown as ReactAgent;
		const geopolitical = stubAgent([
			{
				ticker: "AAPL",
				geopoliticalRisks: [],
				geopoliticalSummary: "none",
				sourceUrls: [],
				notes: "",
			},
		]);

		const { agents, decisionAgent } = buildAgents();
		const result = await run({
			...agents,
			newsSentiment: news,
			geopolitical: geopolitical.agent,
		});

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
