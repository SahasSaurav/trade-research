# AGENTS.md

Project and agent instructions for this repository. System design lives in
[ARCHITECTURE.md](ARCHITECTURE.md); the graph picture in
[WORKFLOW.md](WORKFLOW.md); setup/usage in [README.md](README.md);
conventions in [prefrence.md](prefrence.md).

## Project

`trade-research` is a multi-agent LangGraph pipeline that researches a stock ticker
and produces a cited buy/hold/avoid decision, a trade plan and a prose note,
rendered as a terminal report. Seven agents run as nodes in one explicit
`StateGraph`; five of them are deep agents (`createDeepAgent`), the other two
plain `createAgent`.

## Commands

| Command                     | What it does                                       |
| --------------------------- | -------------------------------------------------- |
| `npm run dev` / `npm start` | Run the pipeline once (ticker hardcoded to `AMZN`) |
| `npm test`                  | Vitest suite                                       |
| `npm run check`             | Lint + format check + typecheck                    |
| `npm run typecheck`         | `tsc --noEmit`                                     |
| `npm run build`             | `tsc` compile to a runnable `dist/`                |

## Architecture rules

Invariants the pipeline depends on — do not break these:

- Feature-based folders: `src/features/<feature>/{agent,node,prompt,schema,tool}.ts`.
- Vendor and data helpers live in `src/utils/` (`src/utils/yahoo/` for the
  Yahoo payload helpers, `src/utils/indicators.ts` for the pure technical
  indicators), not as a feature — they are shared plumbing, not an agent. The
  agent-facing tools stay in the feature that calls them, one `tool.ts` per
  feature (e.g. `src/features/market/tool.ts`).
- Agents return **structured output** via `responseFormat: toolStrategy(schema)`;
  nodes read `result.structuredResponse`.
- Orchestration stays in the explicit `StateGraph` — keep it deterministic.
- One shared agent contract: langchain's `ReactAgent<AgentTypeConfig<T>>`,
  parameterised by the node's artifact type. `createAgent` and `createDeepAgent`
  both satisfy it — no widened `any`, no custom wrapper type.
- Configuration goes through `loadConfig`; never bake secrets or `.env`.
- Persistence is the opt-in SQLite context store (`src/utils/context-store.ts`):
  page cache, run record, checkpoints. It is **derived data** — a run must
  produce the same artifacts with it off, and nothing in the graph may read it
  as authoritative. Tables we own carry `id`, `created_at`, `updated_at`,
  `deleted_at`, and deletes are tombstones.

All other conventions — tooling, code/comment style, determinism, failure
handling, and deep-agent preferences — live in [prefrence.md](prefrence.md).

## The agents

| Agent            | Path                                               | Built with                       | Tools                                                                                                     | Role                                           |
| ---------------- | -------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **financials**   | `src/features/financials/`                         | `createDeepAgent`                | reference search + `open_url`, `compute_valuation_multiples`, Yahoo quote/fundamentals/statements/insider | Valuation multiples + statements, insiders     |
| **analyst**      | `src/features/analyst/`                            | `createDeepAgent`                | reference search + `open_url`, Yahoo consensus                                                            | Sell-side consensus, targets, ratings          |
| **sentiment**    | `src/features/sentiment/`                          | `createDeepAgent` (orchestrator) | none — delegates to subagents                                                                             | Merged sentiment artifact                      |
| ↳ news-sentiment | `src/features/sentiment/subagents/news-sentiment/` | `createAgent` (native subagent)  | news search + `open_url`                                                                                  | Recent news tone                               |
| ↳ geopolitical   | `src/features/sentiment/subagents/geopolitical/`   | `createAgent` (native subagent)  | news search + `open_url`                                                                                  | Geopolitical / macro risk                      |
| **market**       | `src/features/market/`                             | `createDeepAgent`                | reference search + `open_url`, Yahoo quote/technicals                                                     | Technicals: trend, levels, indicators          |
| **debate**       | `src/features/debate/`                             | `createDeepAgent` (orchestrator) | none — delegates to subagents                                                                             | Bull vs. bear over the evidence                |
| ↳ bull           | `src/features/debate/subagents/bull/`              | `createAgent` (native subagent)  | none                                                                                                      | Bull case + its risk posture                   |
| ↳ bear           | `src/features/debate/subagents/bear/`              | `createAgent` (native subagent)  | none                                                                                                      | Bear case; rebuts the bull, + its risk posture |
| **decision**     | `src/features/decision/`                           | `createAgent`                    | none                                                                                                      | Call + fair value + execution plan             |
| **summary**      | `src/features/summary/`                            | `createAgent`                    | none                                                                                                      | Prose analyst note                             |

### Deep agents vs shallow agents

Eleven agents are built one of two ways. The split is deliberate: a deep agent is
used only where planning (and sometimes delegating) inside a node earns its
overhead; everything else is a **shallow agent** — a plain single-pass
`createAgent`.

**Deep agents — 5** (`createDeepAgent`): reason, plan and optionally dispatch
subagents within the node.

| Agent        | Built as   | Inside the node                                                                                             |
| ------------ | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `financials` | deep agent | reference search + `open_url` + `compute_valuation_multiples` + Yahoo quote/fundamentals/statements/insider |
| `analyst`    | deep agent | reference search + `open_url` + Yahoo consensus                                                             |
| `market`     | deep agent | reference search + `open_url` + Yahoo quote/technicals                                                      |
| `sentiment`  | deep agent | orchestrator — dispatches `news-sentiment`, `geopolitical`                                                  |
| `debate`     | deep agent | orchestrator — dispatches `bull`, then `bear`                                                               |

**Shallow agents — 6** (plain `createAgent`): one pass, no planner.

| Agent            | Built as                       | Tools                    |
| ---------------- | ------------------------------ | ------------------------ |
| `decision`       | top-level node                 | none                     |
| `summary`        | top-level node                 | none                     |
| `news-sentiment` | native subagent of `sentiment` | news search + `open_url` |
| `geopolitical`   | native subagent of `sentiment` | news search + `open_url` |
| `bull`           | native subagent of `debate`    | none                     |
| `bear`           | native subagent of `debate`    | none                     |

The four subagents are shallow even though their orchestrators are deep: the
`deepagents` `task` tool picks a subagent by name, and each is a self-contained
`createAgent` runnable with its own prompt and schema. A shallow agent may still
carry tools and a skill (`news-sentiment`, `geopolitical`); it simply has no
deep-agent planner. See [ARCHITECTURE.md](ARCHITECTURE.md) for the deep-vs-plain
rationale and [prefrence.md](prefrence.md) for the conversion rules.

### How an agent is built

```ts
createDeepAgent({
	model, // one shared model instance
	tools: [search, computeValuationMultiples], // optional
	systemPrompt: FINANCIALS_SYSTEM_PROMPT,
	responseFormat: toolStrategy(financialsSchema), // structured output
	middleware: [todoListMiddleware()], // progress scaffolding
	backend: new FilesystemBackend({ rootDir: REPO_ROOT, virtualMode: true }),
	skills: [`${SKILL_DIR}/`], // this agent's one skill
	permissions: SKILL_PERMISSIONS, // read-only inside the skill folder
});
```

- **Research agents** (financials, analyst, market) are standalone deep agents; the
  sentiment orchestrator is a deep agent whose **native subagents** are
  news-sentiment and geopolitical, and the debate orchestrator is a deep agent
  whose native subagents are bull and bear. All four research branches run in
  parallel and produce artifacts. `financials` is the merged valuation +
  fundamentals agent: one pass over the same filings, with EPS recorded once.
- **Shallow agents** (decision and summary, plus the four native subagents) are
  plain `createAgent`: one pass, no planner. A deep agent adds nothing to the
  decision or the summary, which only synthesize or narrate. Risk posture is part
  of the bull/bear cases rather than separate agents.
- **Nested subagents:** the sentiment and debate orchestrators delegate through
  the `deepagents` `task` tool. The sentiment model collects the sources and the
  score is recomputed deterministically; the debate model only collects the two
  cases (see [ARCHITECTURE.md](ARCHITECTURE.md#sentiment-orchestrator)).
- **Prompt holds the contract, skill holds the procedure.** Every agent that does
  research (financials, analyst, market, and the news-sentiment and geopolitical
  subagents) keeps its role, scope, hard rules and guardrails in
  `src/features/<feature>/prompt.ts`, and the how-to — search strategy, sources,
  verification, grading, field rules, examples — in `skills/<name>/SKILL.md`, read
  from disk at runtime under a read-only filesystem confined to that agent's own
  folder. Deep tables live in the `references/` files beside it. Folder name must
  equal the skill's frontmatter `name`. The sentiment and debate orchestrators have
  no skill: they only delegate, so their prompts are the whole contract.

## Deep agents — adopted for research agents

`deepagents` / `createDeepAgent` is adopted **only where it earns its overhead**:
financials, analyst, market, and the sentiment and debate orchestrators. The
`StateGraph` still owns orchestration — deep agents only plan _within_ a node.

- `createDeepAgent` **does** support `responseFormat: toolStrategy(schema)`
  (`SupportedResponseFormat` includes tool strategies), so the `structuredResponse`
  contract holds.
- The sentiment and debate orchestrators use **native subagents**
  (`subagents: [...]`, dispatched by the `task` tool) instead of a hand-rolled
  subgraph.
- **The decision and summary agents stay plain `createAgent`** — no tools, single
  pass; there is nothing to plan.
- The whole benefit is **gated on model strength**. The default is small local
  models (Ollama), where deep agents degrade — looping, misusing the planner,
  emitting invalid structured output. Use a frontier model before trusting the
  deep-agent branches.

Adoption is staged and each step is independently revertible:
`feat(analyst)` → `feat(sentiment)` → `feat(market)` → `feat(financials)` →
`feat(debate)`. See
[prefrence.md](prefrence.md) for the conversion rules.
