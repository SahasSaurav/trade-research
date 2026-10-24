import { validateArtifacts } from "@src/agents/validation/validate.js";
import type { GraphState } from "@src/workflows/state.js";

function createValidationNode() {
	return async (state: GraphState) => {
		const validation = validateArtifacts(
			state.financials,
			state.analyst,
			state.sentiment,
			state.market,
		);

		if (!validation.pass) {
			return {
				validation,
				validationIssues: validation.issues,
				workflowStatus: "insufficient_data",
			};
		}

		return {
			validation,
			validationIssues: [],
			workflowStatus: "running",
		};
	};
}

export { createValidationNode };
