import { ANALYST_USER_MESSAGE } from "@src/features/analyst/prompt.js";
import { analystReportSchema } from "@src/features/analyst/schema.js";
import type { GraphState } from "@src/workflows/state.js";
import type { ReactAgent } from "langchain";

function createAnalystNode(agent: ReactAgent) {
	return async (state: GraphState) => {
		const result = await agent.invoke({
			messages: [
				{
					role: "user",
					content: ANALYST_USER_MESSAGE(state.ticker),
				},
			],
		});
		const responseContent = (result as any).structuredResponse || (result as any).content;
		return {
			analyst: analystReportSchema.parse(responseContent),
		};
	};
}

export { createAnalystNode };
