# Architecture

System design and component boundaries. One explicit
[LangGraph](https://langchain-ai.github.io/langgraphjs/) `StateGraph` orchestrates
seven agents — five deep agents and two plain `createAgent` — plus the
deterministic ticker and validation nodes. Project instructions and the agent
catalogue live in [AGENTS.md](AGENTS.md); conventions in
[prefrence.md](prefrence.md).

## High-level flow

A rendered Mermaid version — the graph, the subagent delegation and a sequence
view — is in [WORKFLOW.md](WORKFLOW.md); the ASCII below is the same flow.

```
START
  │
  ▼
tickerCheck ──(invalid_ticker)──────────────────────────────────────► END
  │ (running)
  ├────────┬───────────┬────────────┐
  ▼        ▼           ▼            ▼
financials analyst   sentiment    market      ← run in parallel
  │        │           │            │          (sentiment & debate = deep agents
  │        │           │            │           with native subagents)
  └────────┴───────────┴────────────┘
                  │
                  ▼
            dataValidation
                  │
   ┌──────────────┼───────────────────┬──────────────┐
   │ analystIssues & budget left       │ pass         │ no pass
   ▼                                   ▼              ▼
analystRepair ──► dataValidation  debateAgent    summaryAgent ──► END
                                      │
                                      │ dispatches bull → bear
                                      ▼
                                 decisionAgent
                                      │
                                      ▼
                                 summaryAgent ──► END
```

Edges (from `src/workflows/graph.ts`):

- `START → tickerCheck`
- `tickerCheck` conditionally routes to `END` on `invalid_ticker`, else to the
  four research agents.
- The four research agents join at `dataValidation`.
- `dataValidation` conditionally routes to `analystRepair` (analyst issues, under
  budget), to `debateAgent` (pass), or to `summaryAgent` (no pass).
- The debate and transforms run as one fixed chain, so the graph — not the model —
  owns the stage order: `debateAgent → decisionAgent → summaryAgent`; inside the
  debate node the orchestrator dispatches the bull, then the bear that rebuts it.
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
| `financials`       | `FinancialsData`                                             | `financialsAgent`               |
| `analyst`          | `AnalystReportData`                                          | `analystAgent`, `analystRepair` |
| `sentiment`        | `SentimentData`                                              | `sentimentAgent`                |
| `market`           | `MarketData`                                                 | `marketAgent`                   |
| `debate`           | `DebateData`                                                 | `debateAgent`                   |
| `summary`          | `SummaryData`                                                | `summaryAgent`                  |
| `validation`       | `ValidationResult`                                           | `dataValidation`                |
| `validationIssues` | `string[]`                                                   | validation                      |
| `analystAttempts`  | `number`                                                     | `analystRepair`                 |
| `workflowStatus`   | `running \| insufficient_data \| invalid_ticker \| complete` | nodes                           |
| `decision`         | `DecisionData`                                               | `decisionAgent`                 |

Node names deliberately differ from channel names (`tickerCheck` vs
`tickerValidation`) — `addNode` throws when a node name collides with a channel.

## Component boundaries

| Component              | Module                      | Responsibility                                            | Depends on                |
| ---------------------- | --------------------------- | --------------------------------------------------------- | ------------------------- |
| CLI entry              | `src/index.ts`              | Stream the graph, render the report                       | workflow, report          |
| Config                 | `src/config/config.ts`      | Validate env into a typed config                          | zod                       |
| Graph                  | `src/workflows/graph.ts`    | Nodes + edges, routing, node timeouts                     | nodes, state              |
| Wiring                 | `src/workflows/workflow.ts` | Build model, tools, agents; assemble                      | providers, features       |
| State                  | `src/workflows/state.ts`    | Channel definitions                                       | feature schemas           |
| Skills                 | `src/workflows/skills.ts`   | Skill constants: root, tools, permissions                 | deepagents                |
| Features               | `src/features/*/`           | One agent/node/tool per capability                        | langchain, schemas        |
| Sentiment orchestrator | `src/features/sentiment/`   | Deep agent + native subagents; deterministic rescore      | subagents                 |
| Debate                 | `src/features/debate/`      | Deep agent + bull/bear native subagents over the evidence | subagents, shared context |

Each feature is self-contained: `agent.ts` (construction), `node.ts` (graph node),
`prompt.ts`, `schema.ts`, optional `tool.ts`. The graph imports only nodes and
state, never prompt/schema internals.

## Agents and tools

Every agent returns **structured output** via
`responseFormat: toolStrategy(schema)`, so nodes read `result.structuredResponse`
and write it to a state channel. Financials, analyst, market, and the sentiment
and debate orchestrators are **deep agents** (`createDeepAgent`, `deepagents`);
the decision and summary agents use `createAgent` (`langchain`).

| Agent                         | Built with    | Tools                                            | Output                  |
| ----------------------------- | ------------- | ------------------------------------------------ | ----------------------- |
| `financials`                  | deep agent    | reference search + `compute_valuation_multiples` | `financialsSchema`      |
| `analyst`                     | deep agent    | reference search                                 | analyst report          |
| `sentiment` (orchestrator)    | deep agent    | none — `task` subagents                          | `sentimentSchema`       |
| ↳ `news-sentiment` (subagent) | `createAgent` | news search                                      | news sentiment research |
| ↳ `geopolitical` (subagent)   | `createAgent` | news search                                      | geopolitical research   |
| `market`                      | deep agent    | reference search                                 | `marketSchema`          |
| `debate` (orchestrator)       | deep agent    | none — `task` subagents                          | `debateSchema`          |
| ↳ `bull` (subagent)           | `createAgent` | none                                             | `bullCaseSchema`        |
| ↳ `bear` (subagent)           | `createAgent` | none                                             | `bearCaseSchema`        |
| `decision`                    | `createAgent` | none                                             | `decisionSchema`        |
| `summary`                     | `createAgent` | none                                             | summary prose           |

### Ownership boundaries

Each fact and each decision has exactly one owner; a downstream agent may weigh
an artifact but never re-produce it.

- **One number, one owner.** The share price belongs to `market` (`financials`
  uses it only as a tool input); EPS and the multiples belong to `financials`;
  the sell-side ratings and targets belong to `analyst` — the news branch may
  flag a rating change as a dated event, never compile a target set or consensus.
- **Two research branches, one axis each.** `news-sentiment` covers the company's
  own news; `geopolitical` covers macro/policy events with a company link — a
  regulator's action on the company's product is news, broad trade/policy is
  geopolitical.
- **One verdict, one owner.** The sentiment band and score belong to `sentiment`
  (the score is stamped in code); `decision` carries them through and does not
  re-score.
- **Risk is evidence, levels are the call.** `bull`/`bear` assess risk posture only;
  `decision` alone owns fair value, the call and the execution levels
  (`stopLoss`, `takeProfit`, `positionSizing`).
- **The summary narrates, it does not decide.** `summary` reports the decision's
  call and levels verbatim and originates nothing.

### The debate layer

`src/features/debate/` is the TradingAgents-style adversarial stage. It is a deep
agent (no tools) whose **native subagents** are `bull` and `bear` — each a plain
`createAgent` transform with no tools, a single pass. The orchestrator dispatches
the bull from the shared research dossier (`researchBlock` in
`src/features/debate/context.ts`), then passes the bull's returned case to the
bear, and returns both cases as `debateSchema`. The orchestrator sequences the two
sides inside the node; the graph still owns the stage's slot in the run, so the
debate is deterministic and the bear genuinely responds rather than running as a
parallel monologue.

Each side states the **risk posture** its own case warrants (`riskPosture` /
`riskPoints`) — how much risk the evidence justifies — instead of a separate set of
risk agents restating the bull/bear thesis. The decision weighs the arguments
against the data; the count of voices never decides the call.

The decision owns both the call and the execution levels. `decisionSchema` carries
the recommendation, fair value, entry range, valuation/catalyst **buy** and
**sell** `priceTriggers`, and an `executionPlan` (`entryPrice`, `stopLoss`,
`takeProfit`, `positionSizing`, `rationale`) grounded in the market artifact's
support/resistance and ATR. One agent owns both, so a stop can never contradict
the call. EPS likewise has one owner: the `financials` agent collects the trailing
and forward figures and the multiples built on them, and records them once.

### Prompts and skills

Instructions are split by kind. The **system prompt**
(`src/features/<feature>/prompt.ts`) carries the contract: role, scope, hard rules
and guardrails. The **skill** (`skills/<name>/SKILL.md`) carries the procedure:
search strategy, source hierarchy, verification, grading rubrics, output contract
and worked examples. A skill is read from disk at runtime through a read-only
filesystem confined to that agent's own folder (`FilesystemBackend` over the repo
root plus a `FilesystemPermission` allow/deny pair), so it costs no prompt tokens
until the agent reads it.

Deep tables — source hierarchies, firm tiers, metric definitions, grading rubrics —
live in `skills/<name>/references/*.md`, linked from `SKILL.md` and read on demand.

The sentiment and debate orchestrators have no skill of their own. They only
dispatch their subagents and collect what they return, so their prompts are the
whole contract and the how-to stays with the branches that actually research. The
decision and summary agents take no skill either: they are transform passes over
artifacts that already exist.

A skill `scripts/` directory is deliberately absent: the agents read through a
`FilesystemBackend`, which is not execution-capable, so deepagents filters the
`execute` tool out — and enabling execution would void the path-based permission
rules (deepagents raises `ConfigurationError` when `permissions` meets a sandbox
backend). Deterministic computation stays in TypeScript tools
(`compute_valuation_multiples`, `scoreSentimentSources`).

| Agent              | Skill folder             |
| ------------------ | ------------------------ |
| `financials`       | `skills/financials/`     |
| `analyst`          | `skills/analyst/`        |
| `market`           | `skills/market/`         |
| ↳ `news-sentiment` | `skills/news-sentiment/` |
| ↳ `geopolitical`   | `skills/geopolitical/`   |

Two Tavily tools (`src/workflows/workflow.ts`) because the filters differ:

- **reference search** — no time filter, `searchDepth: advanced`,
  `chunksPerSource: 1`. For filings/statistics/broker research (financials,
  analyst, market, and `tickerCheck`).
- **news search** — `timeRange: day`. For the two sentiment subagents.

`src/features/search/tool.ts` rewrites `site:` operators into Tavily's
`include_domains`, because Tavily rejects site-only queries and the retriever
swallows the error, causing a wasted loop.

`compute_valuation_multiples` (`src/features/financials/tool.ts`) computes PE/PEG
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

## Configuration and providers

`src/config/config.ts` validates the environment with zod. `createModel`
(`src/workflows/workflow.ts`) builds **one shared model instance** for every agent,
switching on `MODEL_PROVIDER`:

- `openai` → `ChatOpenAI`
- `xai` → `ChatOpenAI` with `baseURL: https://api.x.ai/v1`
- `google-genai` → `ChatGoogle`
- default → `ChatOllama`

Temperature is passed explicitly in every branch — a `temperature || default`
shortcut would silently ignore `MODEL_TEMPERATURE` on the providers it misses.

## Report rendering

`src/report/render.ts` turns the structured decision — including its execution
plan — and the model-written summary markdown into terminal output: a coloured
call badge, aligned figures, a trade-plan block, and rendered summary blocks.
Colour is applied **after** wrapping so escape codes never corrupt layout, and is
suppressed when stdout isn't a TTY. Both the call and the note are rendered from
artifacts, never trusting the summary prose to carry the recommendation.

## Runtime and build

- **Runtime:** `tsx` executes the TypeScript directly in development (`npm start`,
  `npm run dev`), resolving the tsconfig `@src/*` aliases at runtime.
- **`tsc` build:** `npm run build` compiles to `dist/`, then rewrites the `@src/*`
  specifiers to relative paths (`scripts/rewrite-src-aliases.mjs`) so the output is
  a runnable artifact on plain Node — no loader, no TypeScript sources.
- **Docker:** multi-stage `node:26-alpine` (deps → build → prod-deps → runtime),
  prod deps only, non-root, runs the compiled `dist/src/index.js`. No filesystem
  state (the checkpointer is an in-memory `MemorySaver`), no ports.

## Design decisions

- **Explicit graph over dynamic orchestration.** Cross-agent control flow is fixed
  and testable; deep agents plan _inside_ a node, they never own the graph. See
  [AGENTS.md](AGENTS.md).
- **Structured output is the contract.** Agents return schemas; nodes forward
  `structuredResponse`. Nothing downstream parses prose.
- **Determinism where it matters.** Valuation multiples and sentiment scoring are
  computed in code, not by the model; the graph fixes each stage's slot, and the
  debate orchestrator always sequences bull → bear.
- **One owner per number and per level.** EPS lives with the financials agent; the
  decision owns the call and its execution levels, so no two agents can disagree
  about the same price.
- **Debate is evidence, not a vote.** The bull/bear arguments are weighed on the
  data; the decision agent still owns the call and the levels.
- **Fail soft.** Node timeouts degrade a run to `insufficient_data` rather than
  aborting it.

## Tests

`test/` covers node contracts, tools, validation, the sentiment scorer and node,
graph wiring, model config, and report rendering (`nodes`, `search-tool`,
`validate`, `research`, `ticker`, `financials-tool`, `gemini-schema`, `sentiment`,
`model-config`, `config`, `report`, `workflow-graph`).
