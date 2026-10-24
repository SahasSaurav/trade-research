import { z } from "zod";

const bullCaseSchema = z.object({
	thesis: z.string(),
	growthDrivers: z.array(z.string()),
	competitiveAdvantages: z.array(z.string()),
	positiveIndicators: z.array(z.string()),
	// The bull states the risk posture its own case warrants, so the debate
	// covers risk without a separate set of risk agents restating the thesis.
	riskPosture: z.string(),
	riskPoints: z.array(z.string()),
	counterpoints: z.array(z.string()),
	confidence: z.enum(["low", "medium", "high"]),
});

type BullCase = z.infer<typeof bullCaseSchema>;

export type { BullCase };
export { bullCaseSchema };
