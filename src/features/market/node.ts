import { MARKET_USER_MESSAGE } from "@src/features/market/prompt.js";
import type { MarketData } from "@src/features/market/schema.js";
import type { GraphState } from "@src/workflows/state.js";
import type { AgentTypeConfig, ReactAgent } from "langchain";

function createMarketNode(agent: ReactAgent<AgentTypeConfig<MarketData>>) {
	return async (state: GraphState) => {
		const result = await agent.invoke({
			messages: [
				{
					role: "user",
					content: MARKET_USER_MESSAGE(state.ticker),
				},
			],
		});
		return {
			market: result.structuredResponse,
		};
	};
}

export { createMarketNode };
