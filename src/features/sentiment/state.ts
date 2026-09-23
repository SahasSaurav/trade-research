import { Annotation } from "@langchain/langgraph";

const SentimentResearchState = Annotation.Root({
	ticker: Annotation<string>,
	newsResearch: Annotation<unknown>,
	geopoliticalResearch: Annotation<unknown>,
	sentiment: Annotation<unknown>,
});

type SentimentResearchStateType = typeof SentimentResearchState.State;

export { SentimentResearchState };
export type { SentimentResearchStateType };
