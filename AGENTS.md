# AGENTS.md

Project and agent instructions for this repository. System design lives in
[ARCHITECTURE.md](ARCHITECTURE.md); setup/usage in [README.md](README.md);
conventions in [prefrence.md](prefrence.md).

## Project

`trade-research` is a multi-agent LangGraph pipeline that researches a stock ticker
and produces a cited buy/hold/avoid decision, rendered as a terminal report. Six
ReAct agents run as nodes in one explicit `StateGraph`.

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
- One shared agent contract (`ReactAgent`); nodes must not care which
  implementation they hold.
- The model-call budget lives in `src/workflows/agent-guard.ts`; size budgets from
  a real trace, not a round number.
- Configuration goes through `loadConfig`; never bake secrets or `.env`.

All other conventions — tooling, code/comment style, determinism, failure
handling, and deep-agent preferences — live in [prefrence.md](prefrence.md).

## The agents

| Agent              | Path                                               | Tools                                           | Role                                    |
| ------------------ | -------------------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| **valuation**      | `src/features/valuation/`                          | reference search, `compute_valuation_multiples` | Fair value, multiples, price vs. value  |
| **analyst**        | `src/features/analyst/`                            | reference search                                | Sell-side consensus, targets, ratings   |
| **news-sentiment** | `src/features/sentiment/subagents/news-sentiment/` | news search                                     | Recent news tone                        |
| **geopolitical**   | `src/features/sentiment/subagents/geopolitical/`   | news search                                     | Geopolitical / macro risk               |
| **decision**       | `src/features/decision/`                           | none                                            | Synthesis → buy/hold/avoid (structured) |
| **summary**        | `src/features/summary/`                            | none                                            | Prose analyst note                      |

### How an agent is built

```ts
createAgent({
	model, // one shared model instance
	tools: [search, computeValuationMultiples], // optional
	systemPrompt: VALUATION_SYSTEM_PROMPT,
	responseFormat: toolStrategy(valuationSchema), // structured output
	middleware: agentGuardMiddleware(), // model-call budget
}).withConfig(AGENT_GUARD_CONFIG);
```

- **Research agents** (valuation, analyst, news-sentiment, geopolitical) use tools,
  run in parallel, and produce artifacts.
- **Transform agents** (decision, summary) use no tools and run a single pass.
- **Nested subagents:** sentiment is a subgraph — the two sentiment agents are its
  subagents, merged by a deterministic weighted scorer (see
  [ARCHITECTURE.md](ARCHITECTURE.md#sentiment-subgraph)).

## Deep agents — evaluated, not adopted

Deep agents (`deepagents` / `createDeepAgent`) were considered and **deliberately
not adopted**:

- The explicit `StateGraph` already provides the orchestration (fan-out,
  validation, repair loop) a deep agent would do dynamically — and it is
  deterministic and testable.
- Benefit is per-agent and conditional: valuation/analyst might gain a little from
  planning + scratchpad, sentiment could be consolidated into native subagents, but
  **decision and summary gain nothing** (no tools, single pass).
- Benefit is **gated on model strength**. The default is small local models
  (Ollama), where deep agents degrade — looping, misusing the planner, tripping the
  16-call guard, emitting invalid structured output.
- Biggest unknown: whether `createDeepAgent` supports
  `responseFormat: toolStrategy(schema)`; every node depends on
  `structuredResponse`.

**If adopted:** introduce a shared `ResearchAgent` interface + node adapter first,
convert only one research agent (valuation) as a spike, and require a measured win
at acceptable cost before converting more. Keep decision and summary as plain
`createAgent`. See [prefrence.md](prefrence.md) for the adoption preferences.
