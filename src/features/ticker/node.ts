import type { TavilySearch } from "@langchain/tavily";
import { validateTicker } from "@src/features/ticker/validate.js";
import type { GraphState } from "@src/workflows/state.js";

function createTickerValidationNode(search: TavilySearch) {
	return async (state: GraphState) => {
		const tickerValidation = await validateTicker(state.ticker, search);
		if (!tickerValidation.ok) {
			return {
				tickerValidation,
				workflowStatus: "invalid_ticker" as const,
				validationIssues: [tickerValidation.message],
			};
		}
		return {
			ticker: tickerValidation.ticker,
			tickerValidation,
			workflowStatus: "running" as const,
		};
	};
}

export { createTickerValidationNode };
