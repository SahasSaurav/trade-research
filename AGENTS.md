# AGENTS.md

Project and agent instructions for this repository. System design lives in
[ARCHITECTURE.md](ARCHITECTURE.md); setup/usage in [README.md](README.md);
conventions in [prefrence.md](prefrence.md).

## Project

`trade-research` is a multi-agent LangGraph pipeline that researches a stock ticker
and produces a cited buy/hold/avoid decision, rendered as a terminal report. Six
agents run as nodes in one explicit `StateGraph`; three of them are deep agents
(`createDeepAgent`), the other three plain `createAgent`.

## Commands

| Command                     | What it does                                       |
| --------------------------- | -------------------------------------------------- |
| `npm run dev` / `npm start` | Run the pipeline once (ticker hardcoded to `AMZN`) |
| `npm test`                  | Vitest suite                                       |
| `npm run check`             | Lint + format check + typecheck                    |
| `npm run typecheck`         | `tsc --noEmit`                                     |
| `npm run build`             | `tsc` compile to `dist/` (not a runnable artifact) |

## Architecture rules

Invariants the pipeline depends on — do not break these:

- Feature-based folders: `src/features/<feature>/{agent,node,prompt,schema,tool}.ts`.
- Agents return **structured output** via `responseFormat: toolStrategy(schema)`;
  nodes read `result.structuredResponse`.
- Orchestration stays in the explicit `StateGraph` — keep it deterministic.
- One shared agent contract: langchain's `ReactAgent<AgentTypeConfig<T>>`,
  parameterised by the node's artifact type. `createAgent` and `createDeepAgent`
  both satisfy it — no widened `any`, no custom wrapper type.
- The model-call budget lives in `src/workflows/agent-guard.ts`; size budgets from
  a real trace, not a round number.
- Configuration goes through `loadConfig`; never bake secrets or `.env`.

All other conventions — tooling, code/comment style, determinism, failure
handling, and deep-agent preferences — live in [prefrence.md](prefrence.md).

## The agents

| Agent            | Path                                               | Built with                       | Tools                                           | Role                                    |
| ---------------- | -------------------------------------------------- | -------------------------------- | ----------------------------------------------- | --------------------------------------- |
| **valuation**    | `src/features/valuation/`                          | `createDeepAgent`                | reference search, `compute_valuation_multiples` | Fair value, multiples, price vs. value  |
| **analyst**      | `src/features/analyst/`                            | `createDeepAgent`                | reference search                                | Sell-side consensus, targets, ratings   |
| **sentiment**    | `src/features/sentiment/`                          | `createDeepAgent` (orchestrator) | none — delegates to subagents                   | Merged sentiment artifact               |
| ↳ news-sentiment | `src/features/sentiment/subagents/news-sentiment/` | `createAgent` (native subagent)  | news search                                     | Recent news tone                        |
| ↳ geopolitical   | `src/features/sentiment/subagents/geopolitical/`   | `createAgent` (native subagent)  | news search                                     | Geopolitical / macro risk               |
| **decision**     | `src/features/decision/`                           | `createAgent`                    | none                                            | Synthesis → buy/hold/avoid (structured) |
| **summary**      | `src/features/summary/`                            | `createAgent`                    | none                                            | Prose analyst note                      |

### How an agent is built

```ts
createDeepAgent({
	model, // one shared model instance
	tools: [search, computeValuationMultiples], // optional
	systemPrompt: VALUATION_SYSTEM_PROMPT,
	responseFormat: toolStrategy(valuationSchema), // structured output
	middleware: agentGuardMiddleware(), // model-call budget
}).withConfig(AGENT_GUARD_CONFIG);
```

- **Research agents** (valuation, analyst) are standalone deep agents; the
  sentiment orchestrator is a deep agent whose **native subagents** are
  news-sentiment and geopolitical. All three run in parallel and produce artifacts.
- **Transform agents** (decision, summary) stay plain `createAgent` — no tools, a
  single pass; a deep agent adds nothing.
- **Nested subagents:** the sentiment orchestrator delegates through the
  `deepagents` `task` tool. The model collects the sources; the score is recomputed
  deterministically (see
  [ARCHITECTURE.md](ARCHITECTURE.md#sentiment-orchestrator)).

## Deep agents — adopted for research agents

`deepagents` / `createDeepAgent` is adopted **only where it earns its overhead**:
valuation, analyst, and the sentiment orchestrator. The `StateGraph` still owns
orchestration — deep agents only plan _within_ a node.

- `createDeepAgent` **does** support `responseFormat: toolStrategy(schema)`
  (`SupportedResponseFormat` includes tool strategies), so the `structuredResponse`
  contract holds.
- The sentiment orchestrator uses **native subagents** (`subagents: [...]`,
  dispatched by the `task` tool) instead of a hand-rolled subgraph.
- **decision and summary stay plain `createAgent`** — no tools, single pass; there
  is nothing to plan.
- The whole benefit is **gated on model strength**. The default is small local
  models (Ollama), where deep agents degrade — looping, misusing the planner,
  tripping the 16-call guard, emitting invalid structured output. Use a frontier
  model before trusting the deep-agent branches.

Adoption is staged and each step is independently revertible:
`feat(valuation)` → `feat(analyst)` → `feat(sentiment)`. See
[prefrence.md](prefrence.md) for the conversion rules.
