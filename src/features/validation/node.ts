import { validateArtifacts } from "@src/features/validation/validate.js";
import type { GraphState } from "@src/workflows/state.js";

function createValidationNode() {
	return async (state: GraphState) => {
		const validation = validateArtifacts(
			state.valuation,
			state.analyst,
			state.sentiment,
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
