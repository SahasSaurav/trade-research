import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SUMMARY_SYSTEM_PROMPT } from "@src/features/summary/prompt.js";
import { summarySchema } from "@src/features/summary/schema.js";
import { createAgent, toolStrategy } from "langchain";
import { z } from "zod";

// zod v4 emits JSON Schema natively; the OpenAPI 3.0 target matches Gemini's
// `Schema` subset (single `type` plus `nullable`). The `~standard` marker is
// dropped so langchain passes the schema through instead of re-converting it
// to draft-2020-12, and the keywords the Gemini proto does not define are
// removed. The Google GenAI SDK strips `additionalProperties` on the tool path.
const { "~standard": _standard, ...summaryJsonSchema } = z.toJSONSchema(
	summarySchema,
	{
		target: "openapi-3.0",
		override: ({ jsonSchema }) => {
			delete jsonSchema.minimum;
			delete jsonSchema.maximum;
			delete jsonSchema.format;
		},
	},
);

const summaryResponseFormat = toolStrategy(
	summaryJsonSchema as unknown as { type: "object" } & Record<string, unknown>,
);

function createSummaryAgent(model: BaseChatModel) {
	return createAgent({
		model,
		systemPrompt: SUMMARY_SYSTEM_PROMPT,
		responseFormat: summaryResponseFormat,
	});
}

export { createSummaryAgent };
