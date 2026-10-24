# Preferences / Conventions

Conventions to follow when contributing to this repo. Project instructions and the
agent catalogue are in [AGENTS.md](AGENTS.md); system design in
[ARCHITECTURE.md](ARCHITECTURE.md); setup/usage in [README.md](README.md).

## Language and tooling

- **TypeScript**, `strict`, ESM (`"module": "nodenext"`).
- Run via **`tsx`** in development (`npm start`, `npm run dev`). `npm run build`
  compiles to `dist/` and rewrites the `@src/*` aliases to relative paths
  (`scripts/rewrite-src-aliases.mjs`), so the built output runs on plain `node`
  and is what the Docker image executes.
- **Lint / format:** oxlint + oxfmt (tabs). `npm run check` = lint +
  `format:check` + `typecheck`.
- **Tests:** vitest (`npm test`).
- **Dependencies:** anything the running code imports goes in `dependencies`; tools
  used only to build, test, lint or format (`typescript`, `vitest`, `oxlint`,
  `oxfmt`, `tsx`) go in `devDependencies`, so the Docker runtime stage
  (`npm ci --omit=dev`) stays free of them. Declare every package you import
  directly — never lean on a transitive or auto-installed peer dependency.
- **Commits:** Conventional Commits — `feat`, `fix`, `refactor`, `chore`, `perf`,
  `build`, `test`.
- **Docker:** `node:26-alpine`, multi-stage, non-root `node` user, secrets via env
  only.

## Architecture

- One folder per agent: `src/agents/<agent>/{agent,node,prompt,schema,tool}.ts`.
- Vendor and data helpers live in `src/utils/` (`src/utils/yahoo/` for the
  Yahoo payload helpers, `src/utils/indicators.ts` for the pure technical
  indicators), not as a feature — they are shared plumbing, not an agent. The
  agent-facing tools stay in the feature that calls them, one `tool.ts` per
  feature (e.g. `src/agents/market/tool.ts`).
- Agents return **structured output** via `responseFormat: toolStrategy(schema)`;
  nodes read `result.structuredResponse`.
- Orchestration stays in the explicit `StateGraph` — keep it deterministic and
  testable. Deep agents plan inside a node; they never own the graph.
- One shared agent contract: langchain's `ReactAgent<AgentTypeConfig<T>>`,
  parameterised by the node's artifact type. `createAgent` and `createDeepAgent`
  both satisfy it without a widened `any`.
- **Deep agents only where they earn it.** Financials, analyst, market, and the
  sentiment and debate orchestrators use `createDeepAgent`; the decision and
  summary agents stay `createAgent`.
- Configuration goes through `loadConfig`; never bake secrets or `.env`.

## Code and comment style

- Comments explain **why**, not what; keep them short.
- Prefer named exports; avoid `default` exports.
- Don't add a dependency unless it removes more complexity than it adds.

## Determinism

- Compute numbers in code, not in prompts: valuation multiples
  (`compute_valuation_multiples`) and sentiment scoring (`scoreSentimentSources`)
  are deterministic on purpose. The sentiment orchestrator may collect sources, but
  it never sets the score.
- Render the report from structured artifacts, never from model prose.

## Failure handling

- Fail soft: node timeouts degrade a run to `insufficient_data` rather than
  throwing and taking down sibling branches.
- Only retry **transient** provider errors (see `runResearch`).

## Deep agents

- **Adopted for research agents:** financials, analyst, market, and the sentiment
  and debate orchestrators use `createDeepAgent`. The decision and summary agents
  stay plain `createAgent`; they gain nothing.
- Native subagents: the sentiment and debate orchestrators declare
  `subagents: [...]` and dispatch through the `task` tool instead of a
  hand-rolled subgraph.
- Determinism is preserved by putting the model on source _collection_ and code on
  the _number_ (`scoreSentimentSources`).
- Only trust the deep-agent branches on a **frontier model**; small/local models
  are net-negative.
- Land changes **one agent per commit** and keep each independently revertible.
