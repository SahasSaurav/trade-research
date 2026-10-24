import type { GraphState } from "@src/workflows/state.js";

/**
 * Render one research artifact into the debate dossier, or say plainly that it
 * never arrived. A missing branch stringified as "undefined" reads as a blank
 * finding and invites the model to fill it in; naming the absence keeps the
 * argument honest.
 */
function artifactBlock(label: string, value: unknown): string {
	return value === undefined
		? `${label}: not produced in this run — treat it as missing evidence, not an empty finding.`
		: `${label}:\n${JSON.stringify(value, null, 2)}`;
}

/**
 * The shared research dossier both debate subagents argue over. Only the
 * upstream research artifacts are included: the debate is about the evidence,
 * and the orchestrator passes the bull's case to the bear separately so the
 * two sides actually engage.
 */
function researchBlock(state: GraphState): string {
	return [
		artifactBlock("FINANCIALS & VALUATION", state.financials),
		artifactBlock("SELL-SIDE ANALYST REPORTS", state.analyst),
		artifactBlock("SENTIMENT & GEOPOLITICAL", state.sentiment),
		artifactBlock("TECHNICAL MARKET", state.market),
	].join("\n\n");
}

export { artifactBlock, researchBlock };
