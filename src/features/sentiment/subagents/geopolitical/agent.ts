import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredTool } from "@langchain/core/tools";
import { GEOPOLITICAL_SYSTEM_PROMPT } from "@src/features/sentiment/subagents/geopolitical/prompt.js";
import { geopoliticalResearchSchema } from "@src/features/sentiment/subagents/geopolitical/schema.js";
import { createAgent, toolStrategy } from "langchain";
import { z } from "zod";

// zod v4 emits JSON Schema natively; the OpenAPI 3.0 target matches Gemini's
// `Schema` subset (single `type` plus `nullable`). The `~standard` marker is
// dropped so langchain passes the schema through instead of re-converting it
// to draft-2020-12, and the keywords the Gemini proto does not define are
// removed. The Google GenAI SDK strips `additionalProperties` on the tool path.
const { "~standard": _standard, ...geopoliticalJsonSchema } = z.toJSONSchema(
	geopoliticalResearchSchema,
	{
		target: "openapi-3.0",
		override: ({ jsonSchema }) => {
			delete jsonSchema.minimum;
			delete jsonSchema.maximum;
			delete jsonSchema.format;
		},
	},
);

const geopoliticalResponseFormat = toolStrategy(
	geopoliticalJsonSchema as unknown as { type: "object" } & Record<
		string,
		unknown
	>,
);

function createGeopoliticalAgent(model: BaseChatModel, search: StructuredTool) {
	return createAgent({
		model,
		tools: [search],
		systemPrompt: GEOPOLITICAL_SYSTEM_PROMPT,
		responseFormat: geopoliticalResponseFormat,
	});
}

export { createGeopoliticalAgent };
