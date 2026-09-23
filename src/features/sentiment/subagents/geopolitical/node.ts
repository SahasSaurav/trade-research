import { GEOPOLITICAL_USER_MESSAGE } from "@src/features/sentiment/subagents/geopolitical/prompt.js";
import type { SentimentResearchStateType } from "@src/features/sentiment/workflow/state.js";
import type { ReactAgent } from "langchain";

function createGeopoliticalNode(agent: ReactAgent) {
	return async (state: SentimentResearchStateType) => {
		const result = await agent.invoke({
			messages: [
				{ role: "user", content: GEOPOLITICAL_USER_MESSAGE(state.ticker) },
			],
		});
		return { geopoliticalResearch: result.structuredResponse };
	};
}

export { createGeopoliticalNode };
