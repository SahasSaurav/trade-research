import { bearCaseSchema } from "@src/features/debate/subagents/bear/schema.js";
import { bullCaseSchema } from "@src/features/debate/subagents/bull/schema.js";
import { z } from "zod";

/**
 * What the debate orchestrator returns: both cases, copied verbatim from the
 * subagents. The decision reads `debate.bull` and `debate.bear`; the debate is
 * evidence, not a vote, so there is no verdict field here.
 */
const debateSchema = z.object({
	bull: bullCaseSchema,
	bear: bearCaseSchema,
});

type DebateData = z.infer<typeof debateSchema>;

export type { DebateData };
export { debateSchema };
