import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { DECISION_SYSTEM_PROMPT } from "@src/features/decision/prompt.js";
import { decisionSchema } from "@src/features/decision/schema.js";
import { createAgent, toolStrategy } from "langchain";
import { z } from "zod";

// zod v4 emits JSON Schema natively; the OpenAPI 3.0 target matches Gemini's
// `Schema` subset (single `type` plus `nullable`). The `~standard` marker is
// dropped so langchain passes the schema through instead of re-converting it
// to draft-2020-12, and the keywords the Gemini proto does not define are
// removed. The Google GenAI SDK strips `additionalProperties` on the tool path.
const { "~standard": _standard, ...decisionJsonSchema } = z.toJSONSchema(
	decisionSchema,
	{
		target: "openapi-3.0",
		override: ({ jsonSchema }) => {
			delete jsonSchema.minimum;
			delete jsonSchema.maximum;
			delete jsonSchema.format;
		},
	},
);

const decisionResponseFormat = toolStrategy(
	decisionJsonSchema as unknown as { type: "object" } & Record<string, unknown>,
);

function createDecisionAgent(model: BaseChatModel) {
	return createAgent({
		model,
		tools: [],
		systemPrompt: DECISION_SYSTEM_PROMPT,
		responseFormat: decisionResponseFormat,
	});
}

export { createDecisionAgent };
