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
- Agents return **structured output** via `responseFormat: toolStrategy(schema)`;
  nodes read `result.structuredResponse`.
- Orchestration stays in the explicit `StateGraph` — keep it deterministic.
- One shared agent contract: langchain's `ReactAgent<AgentTypeConfig<T>>`,
  parameterised by the node's artifact type. `createAgent` and `createDeepAgent`
  both satisfy it — no widened `any`, no custom wrapper type.
- Configuration goes through `loadConfig`; never bake secrets or `.env`.

All other conventions — tooling, code/comment style, determinism, failure
handling, and deep-agent preferences — live in [prefrence.md](prefrence.md).

## The agents

| Agent            | Path                                               | Built with                       | Tools                                           | Role                                           |
| ---------------- | -------------------------------------------------- | -------------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| **financials**   | `src/features/financials/`                         | `createDeepAgent`                | reference search, `compute_valuation_multiples` | Valuation multiples + statements, insiders     |
| **analyst**      | `src/features/analyst/`                            | `createDeepAgent`                | reference search                                | Sell-side consensus, targets, ratings          |
| **sentiment**    | `src/features/sentiment/`                          | `createDeepAgent` (orchestrator) | none — delegates to subagents                   | Merged sentiment artifact                      |
| ↳ news-sentiment | `src/features/sentiment/subagents/news-sentiment/` | `createAgent` (native subagent)  | news search                                     | Recent news tone                               |
| ↳ geopolitical   | `src/features/sentiment/subagents/geopolitical/`   | `createAgent` (native subagent)  | news search                                     | Geopolitical / macro risk                      |
| **market**       | `src/features/market/`                             | `createDeepAgent`                | reference search                                | Technicals: trend, levels, indicators          |
| **debate**       | `src/features/debate/`                             | `createDeepAgent` (orchestrator) | none — delegates to subagents                   | Bull vs. bear over the evidence                |
| ↳ bull           | `src/features/debate/subagents/bull/`              | `createAgent` (native subagent)  | none                                            | Bull case + its risk posture                   |
| ↳ bear           | `src/features/debate/subagents/bear/`              | `createAgent` (native subagent)  | none                                            | Bear case; rebuts the bull, + its risk posture |
| **decision**     | `src/features/decision/`                           | `createAgent`                    | none                                            | Call + fair value + execution plan             |
| **summary**      | `src/features/summary/`                            | `createAgent`                    | none                                            | Prose analyst note                             |

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
- **Transform agents** (decision and summary) stay plain `createAgent` — no tools,
  a single pass; a deep agent adds nothing. Risk posture is part of the bull/bear
  cases rather than separate agents.
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
