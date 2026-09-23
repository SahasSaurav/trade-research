import { Annotation } from "@langchain/langgraph";
import type { GeopoliticalResearch } from "@src/features/sentiment/subagents/geopolitical/schema.js";
import type { NewsSentimentResearch } from "@src/features/sentiment/subagents/news/schema.js";
import type { SentimentData } from "@src/features/sentiment/schema.js";

const SentimentResearchState = Annotation.Root({
	ticker: Annotation<string>,
	newsResearch: Annotation<NewsSentimentResearch | undefined>,
	geopoliticalResearch: Annotation<GeopoliticalResearch | undefined>,
	sentiment: Annotation<SentimentData | undefined>,
});

type SentimentResearchStateType = typeof SentimentResearchState.State;

export { SentimentResearchState };
export type { SentimentResearchStateType };
