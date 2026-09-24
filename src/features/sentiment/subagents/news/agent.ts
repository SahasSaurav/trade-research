import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredTool } from "@langchain/core/tools";
import { NEWS_SENTIMENT_SYSTEM_PROMPT } from "@src/features/sentiment/subagents/news/prompt.js";
import { newsSentimentResearchSchema } from "@src/features/sentiment/subagents/news/schema.js";
import { createAgent, toolStrategy } from "langchain";
import { z } from "zod";

// zod v4 emits JSON Schema natively; the OpenAPI 3.0 target matches Gemini's
// `Schema` subset (single `type` plus `nullable`). The `~standard` marker is
// dropped so langchain passes the schema through instead of re-converting it
// to draft-2020-12, and the keywords the Gemini proto does not define are
// removed. The Google GenAI SDK strips `additionalProperties` on the tool path.
const { "~standard": _standard, ...newsJsonSchema } = z.toJSONSchema(
	newsSentimentResearchSchema,
	{
		target: "openapi-3.0",
		override: ({ jsonSchema }) => {
			delete jsonSchema.minimum;
			delete jsonSchema.maximum;
			delete jsonSchema.format;
		},
	},
);

const newsSentimentResponseFormat = toolStrategy(
	newsJsonSchema as unknown as { type: "object" } & Record<string, unknown>,
);

function createNewsSentimentAgent(
	model: BaseChatModel,
	search: StructuredTool,
) {
	return createAgent({
		model,
		tools: [search],
		systemPrompt: NEWS_SENTIMENT_SYSTEM_PROMPT,
		responseFormat: newsSentimentResponseFormat,
	});
}

export { createNewsSentimentAgent };
