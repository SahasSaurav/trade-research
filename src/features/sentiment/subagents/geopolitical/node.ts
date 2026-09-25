import { GEOPOLITICAL_USER_MESSAGE } from "@src/features/sentiment/subagents/geopolitical/prompt.js";
import { geopoliticalResearchSchema } from "@src/features/sentiment/subagents/geopolitical/schema.js";
import { runResearch } from "@src/features/sentiment/workflow/research.js";
import type { SentimentResearchStateType } from "@src/features/sentiment/workflow/state.js";
import type { ReactAgent } from "langchain";

function createGeopoliticalNode(agent: ReactAgent) {
	return async (state: SentimentResearchStateType) => {
		const outcome = await runResearch(
			async () =>
				(
					await agent.invoke({
						messages: [
							{
								role: "user",
								content: GEOPOLITICAL_USER_MESSAGE(state.ticker),
							},
						],
					})
				).structuredResponse,
			geopoliticalResearchSchema,
		);
		return outcome.error
			? { geopoliticalResearch: undefined, geopoliticalError: outcome.error }
			: {
					geopoliticalResearch: outcome.data,
					geopoliticalError: undefined,
				};
	};
}

export { createGeopoliticalNode };
