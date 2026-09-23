import { SUMMARY_USER_MESSAGE } from "@src/features/summary/prompt.js";
import { summarySchema } from "@src/features/summary/schema.js";
import type { GraphState } from "@src/workflows/state.js";
import type { ReactAgent } from "langchain";

function createSummaryNode(agent: ReactAgent) {
	return async (state: GraphState) => {
		const result = await agent.invoke({
			messages: [
				{
					role: "user",
					content: SUMMARY_USER_MESSAGE(
						state.ticker,
						state.valuation,
						state.analyst,
					),
				},
			],
		});
		const responseContent = (result as any).structuredResponse || (result as any).content;
		return {
			summary: summarySchema.parse(responseContent),
		};
	};
}

export { createSummaryNode };
