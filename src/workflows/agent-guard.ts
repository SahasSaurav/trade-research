import type { AgentMiddleware } from "langchain";
import { modelCallLimitMiddleware } from "langchain";

/**
 * Upper bound on model calls per agent invocation.
 *
 * A React agent is a Pregel graph of its own and gets a fresh copy of the
 * recursion limit on every invoke, so an agent that keeps retrying a failing
 * tool runs until LangGraph throws GraphRecursionError. None of the node
 * wrappers catch that, so it aborts the whole workflow instead of degrading to
 * insufficient_data.
 *
 * 16 calls is one opening call plus up to fifteen tool round trips. It has to
 * clear the valuation prompt's own demands — six metrics, two sources each,
 * plus a compute_valuation_multiples call — and Tavily returns an off-target
 * page often enough that the model needs room to rephrase and try again. The
 * budget is measured, not guessed: at 12 the valuation agent found every metric,
 * computed its multiples, and was cut off on the last step before it could
 * emit the structured response, so the artifact came back empty. Sizing this
 * from a live trace rather than a comfortable-looking round number is the
 * whole point; a tighter budget returns no valuation at all, which is the
 * failure this guard exists to prevent.
 */
const MAX_MODEL_CALLS = 16;

/**
 * Supersteps one model call costs once the limit middleware is in the chain:
 * before_model, model_request, after_model, tools. Without this the guard
 * cannot fire — the agent hits the recursion limit while still inside its own
 * budget, which is the exact failure the guard exists to prevent.
 */
const SUPERSTEPS_PER_MODEL_CALL = 4;

/**
 * Sized so MAX_MODEL_CALLS can be exhausted first, leaving room for the
 * middleware nodes that run after the limit trips.
 */
const AGENT_RECURSION_LIMIT = MAX_MODEL_CALLS * SUPERSTEPS_PER_MODEL_CALL + 10;

const AGENT_GUARD_CONFIG = { recursionLimit: AGENT_RECURSION_LIMIT } as const;

/**
 * "end" rather than "error": an exhausted agent returns whatever it has, the
 * node writes `undefined` for that artifact, the validation node reports
 * insufficient_data, and the run still prints a summary saying what is missing.
 * Throwing would take down the sibling branches that already succeeded.
 */
function agentGuardMiddleware(): AgentMiddleware[] {
	return [
		modelCallLimitMiddleware({
			runLimit: MAX_MODEL_CALLS,
			exitBehavior: "end",
		}),
	];
}

export { AGENT_GUARD_CONFIG, agentGuardMiddleware, MAX_MODEL_CALLS };
