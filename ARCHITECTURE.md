# Architecture

System design and component boundaries. One explicit
[LangGraph](https://langchain-ai.github.io/langgraphjs/) `StateGraph` orchestrates
six agents — three deep agents and three plain `createAgent` — plus two
deterministic nodes. Project instructions and the agent catalogue live in
[AGENTS.md](AGENTS.md); conventions in [prefrence.md](prefrence.md).

## High-level flow

```
START
  │
  ▼
tickerCheck ──(invalid_ticker)──────────────────────────────────────────► END
  │ (running)
  ├───────────────┬────────────────────┐
  ▼               ▼                    ▼
valuationAgent  analystAgent      sentimentAgent      ← run in parallel
  │               │                    │                 (sentiment = deep agent
  │               │                    │                  with native subagents)
  └───────────────┴────────────────────┘
                  │
                  ▼
            dataValidation
                  │
        ┌─────────┼───────────────────────────────┐
        │ analystIssues & budget left              │ pass
        ▼                                          ▼
   analystRepair ──► dataValidation          decisionAgent
                                                      │
                                           (fail / no pass)│
                                                      ▼
                                                 summaryAgent ──► END
```

Edges (from `src/workflows/graph.ts`):

- `START → tickerCheck`
- `tickerCheck` conditionally routes to `END` on `invalid_ticker`, else to the
  three research agents.
- The three research agents join at `dataValidation`.
- `dataValidation` conditionally routes to `analystRepair` (analyst issues, under
  budget), to `summaryAgent` (no pass), or to `decisionAgent` (pass).
- `analystRepair → dataValidation` (loop), `decisionAgent → summaryAgent`, and
  `summaryAgent → END`.

Every agent node has a `timeout` of `NODE_TIMEOUT_MS` (`99_999` ms).

## State

`WorkflowState` (`src/workflows/state.ts`) is the single channel object threaded
through the graph:

| Channel            | Type                                                         | Written by                      |
| ------------------ | ------------------------------------------------------------ | ------------------------------- |
| `ticker`           | `string`                                                     | input                           |
| `tickerValidation` | `TickerValidation`                                           | `tickerCheck`                   |
| `valuation`        | `ValuationData`                                              | `valuationAgent`                |
| `analyst`          | `AnalystReportData`                                          | `analystAgent`, `analystRepair` |
| `sentiment`        | `SentimentData`                                              | `sentimentAgent`                |
| `summary`          | `SummaryData`                                                | `summaryAgent`                  |
| `validation`       | `ValidationResult`                                           | `dataValidation`                |
| `validationIssues` | `string[]`                                                   | validation                      |
| `analystAttempts`  | `number`                                                     | `analystRepair`                 |
| `workflowStatus`   | `running \| insufficient_data \| invalid_ticker \| complete` | nodes                           |
| `decision`         | `DecisionData`                                               | `decisionAgent`                 |

Node names deliberately differ from channel names (`tickerCheck` vs
`tickerValidation`) — `addNode` throws when a node name collides with a channel.

## Component boundaries

| Component              | Module                         | Responsibility                                       | Depends on          |
| ---------------------- | ------------------------------ | ---------------------------------------------------- | ------------------- |
| CLI entry              | `src/index.ts`                 | Stream the graph, render the report                  | workflow, report    |
| Config                 | `src/config/config.ts`         | Validate env into a typed config                     | zod                 |
| Graph                  | `src/workflows/graph.ts`       | Nodes + edges, routing, node timeouts                | nodes, state        |
| Wiring                 | `src/workflows/workflow.ts`    | Build model, tools, agents; assemble                 | providers, features |
| State                  | `src/workflows/state.ts`       | Channel definitions                                  | feature schemas     |
| Guard                  | `src/workflows/agent-guard.ts` | Model-call budget middleware                         | langchain           |
| Features               | `src/features/*/`              | One agent/node/tool per capability                   | langchain, schemas  |
| Sentiment orchestrator | `src/features/sentiment/`      | Deep agent + native subagents; deterministic rescore | subagents           |
| Report                 | `src/report/render.ts`         | Render artifacts to terminal                         | —                   |

Each feature is self-contained: `agent.ts` (construction), `node.ts` (graph node),
`prompt.ts`, `schema.ts`, optional `tool.ts`. The graph imports only nodes and
state, never prompt/schema internals.

## Agents and tools

Every agent returns **structured output** via
`responseFormat: toolStrategy(schema)`, so nodes read `result.structuredResponse`
and write it to a state channel. Valuation, analyst, and the sentiment orchestrator
are **deep agents** (`createDeepAgent`, `deepagents`); decision and summary use
`createAgent` (`langchain`).

| Agent                         | Built with    | Tools                                            | Output                  |
| ----------------------------- | ------------- | ------------------------------------------------ | ----------------------- |
| `valuation`                   | deep agent    | reference search + `compute_valuation_multiples` | `valuationSchema`       |
| `analyst`                     | deep agent    | reference search                                 | analyst report          |
| `sentiment` (orchestrator)    | deep agent    | none — `task` subagents                          | `sentimentSchema`       |
| ↳ `news-sentiment` (subagent) | `createAgent` | news search                                      | news sentiment research |
| ↳ `geopolitical` (subagent)   | `createAgent` | news search                                      | geopolitical research   |
| `decision`                    | `createAgent` | none                                             | `decisionSchema`        |
| `summary`                     | `createAgent` | none                                             | summary prose           |

Two Tavily tools (`src/workflows/workflow.ts`) because the filters differ:

- **reference search** — no time filter, `searchDepth: advanced`,
  `chunksPerSource: 1`. For filings/statistics/broker research (valuation,
  analyst, and `tickerCheck`).
- **news search** — `timeRange: day`. For the two sentiment subagents.

`src/features/search/tool.ts` rewrites `site:` operators into Tavily's
`include_domains`, because Tavily rejects site-only queries and the retriever
swallows the error, causing a wasted loop.

`compute_valuation_multiples` (`src/features/valuation/tool.ts`) computes PE/PEG
deterministically, so the model never divides in-head.

## Sentiment orchestrator

`sentimentAgent` (`src/features/sentiment/agent.ts`) is a deep agent whose
**native subagents** are `news_sentiment` and `geopolitical` (declared via
`subagents: [...]`, each a `CompiledSubAgent` wrapping a structured agent). The
orchestrator dispatches them through the `task` tool and returns one
`sentimentSchema` artifact.

The **score stays deterministic**: the model collects the cited sources, code
decides the number. `createSentimentNode` (`src/features/sentiment/node.ts`)
recomputes the score from the returned sources with `scoreSentimentSources`
(`src/features/sentiment/score.ts`):

- sentiment value: `positive 1 / neutral 0 / negative -1`
- evidence weight: `high 1 / medium 0.65 / low 0.35`
- recency weight by age: `≤7d 1 / ≤30d 0.75 / ≤90d 0.4 / else 0`
- score = weighted average, `null` when no weight; thresholds `±0.15` for
  `positive` / `negative`, otherwise `neutral`

The node also dedupes `sourceUrls`, and on a hard orchestrator failure writes a
failed-sentiment sentinel (`researchStatus` both `failed`) so the run degrades
rather than aborting. `runResearch` (`src/features/sentiment/research.ts`) retries
**only transient provider errors** (408/429/5xx, network codes) with exponential
backoff and validates the result against the zod schema.

## Guard: model-call budget

`src/workflows/agent-guard.ts` attaches `modelCallLimitMiddleware` with
`runLimit = 16` and `exitBehavior: "end"`.

A ReAct agent is its own Pregel graph, so it gets a fresh recursion limit on every
`invoke` and would otherwise spin to a `GraphRecursionError` that no node catches —
aborting sibling branches that already succeeded. `exitBehavior: "end"` makes the
agent return what it has, the node writes `undefined`, validation reports
`insufficient_data`, and the run still produces a summary. The recursion limit
(`16 × 4 supersteps + 10 = 74`) is derived so the call limit trips first.

Every agent — deep or plain, parent or subagent — carries this middleware. Deep
agents spend extra calls on planning and `task` delegation, so `MAX_MODEL_CALLS` may
need raising (per agent) if a deep branch trips it.

## Configuration and providers

`src/config/config.ts` validates the environment with zod. `createModel`
(`src/workflows/workflow.ts`) builds **one shared model instance** for all six
agents, switching on `MODEL_PROVIDER`:

- `openai` → `ChatOpenAI`
- `xai` → `ChatOpenAI` with `baseURL: https://api.x.ai/v1`
- `google-genai` → `ChatGoogle`
- default → `ChatOllama`

Temperature is passed explicitly in every branch — a `temperature || default`
shortcut would silently ignore `MODEL_TEMPERATURE` on the providers it misses.

## Report rendering

`src/report/render.ts` turns the structured decision and the model-written summary
markdown into terminal output: a coloured call badge, aligned figures, and
rendered summary blocks. Colour is applied **after** wrapping so escape codes
never corrupt layout, and is suppressed when stdout isn't a TTY. Both the call and
the note are rendered from artifacts, never trusting the summary prose to carry
the recommendation.

## Runtime and build

- **Runtime:** `tsx` executes the TypeScript directly (`npm start`), resolving the
  tsconfig `@src/*` aliases at runtime.
- **`tsc` build:** emits `dist/` but leaves `@src/*` specifiers that Node cannot
  resolve — so `dist/` is _not_ the run path.
- **Docker:** multi-stage `node:26-alpine` (deps + runtime), prod deps only,
  non-root, runs `tsx` from source. No filesystem state (the checkpointer is an
  in-memory `MemorySaver`), no ports.

## Design decisions

- **Explicit graph over dynamic orchestration.** Cross-agent control flow is fixed
  and testable; deep agents plan _inside_ a node, they never own the graph. See
  [AGENTS.md](AGENTS.md).
- **Structured output is the contract.** Agents return schemas; nodes forward
  `structuredResponse`. Nothing downstream parses prose.
- **Determinism where it matters.** Valuation multiples and sentiment scoring are
  computed in code, not by the model.
- **Fail soft.** Budgets, timeouts, and `exitBehavior: "end"` degrade to
  `insufficient_data` rather than aborting the run.

## Tests

`test/` covers node contracts, tools, validation, the sentiment scorer and node,
graph wiring, model config, and report rendering (`nodes`, `search-tool`,
`validate`, `research`, `ticker`, `valuation-tool`, `gemini-schema`, `agent-guard`,
`sentiment`, `model-config`, `config`, `report`, `workflow-graph`).
