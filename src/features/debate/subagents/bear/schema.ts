import { z } from "zod";

const bearCaseSchema = z.object({
	thesis: z.string(),
	riskFactors: z.array(z.string()),
	competitiveWeaknesses: z.array(z.string()),
	negativeIndicators: z.array(z.string()),
	// The bear states the risk posture the case against owning warrants, so the
	// debate covers risk without a separate set of risk agents restating it.
	riskPosture: z.string(),
	riskPoints: z.array(z.string()),
	counterpoints: z.array(z.string()),
	confidence: z.enum(["low", "medium", "high"]),
});

type BearCase = z.infer<typeof bearCaseSchema>;

export type { BearCase };
export { bearCaseSchema };
