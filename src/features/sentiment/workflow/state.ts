import { Annotation } from "@langchain/langgraph";
import type { SentimentData } from "@src/features/sentiment/schema.js";
import type { GeopoliticalResearch } from "@src/features/sentiment/subagents/geopolitical/schema.js";
import type { NewsSentimentResearch } from "@src/features/sentiment/subagents/news-sentiment/schema.js";

const SentimentResearchState = Annotation.Root({
	ticker: Annotation<string>,
	newsResearch: Annotation<NewsSentimentResearch | undefined>,
	newsError: Annotation<string | undefined>,
	geopoliticalResearch: Annotation<GeopoliticalResearch | undefined>,
	geopoliticalError: Annotation<string | undefined>,
	sentiment: Annotation<SentimentData | undefined>,
});

type SentimentResearchStateType = typeof SentimentResearchState.State;

export type { SentimentResearchStateType };
export { SentimentResearchState };
