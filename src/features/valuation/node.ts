import { VALUATION_USER_MESSAGE } from "@src/features/valuation/prompt.js";
import { valuationSchema } from "@src/features/valuation/schema.js";
import type { GraphState } from "@src/workflows/state.js";
import type { ReactAgent } from "langchain";

function createValuationNode(agent: ReactAgent) {
	return async (state: GraphState) => {
		const result = await agent.invoke({
			messages: [
				{
					role: "user",
					content: VALUATION_USER_MESSAGE(state.ticker),
				},
			],
		});
		const responseContent = (result as any).structuredResponse || (result as any).content;
		return {
			valuation: valuationSchema.parse(responseContent),
		};
	};
}

export { createValuationNode };
