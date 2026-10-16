# Preferences / Conventions

Conventions to follow when contributing to this repo. Project instructions and the
agent catalogue are in [AGENTS.md](AGENTS.md); system design in
[ARCHITECTURE.md](ARCHITECTURE.md); setup/usage in [README.md](README.md).

## Language and tooling

- **TypeScript**, `strict`, ESM (`"module": "nodenext"`).
- Run via **`tsx`** (`npm start`, `npm run dev`); the compiled `dist/` is not a
  runnable artifact (the `@src/*` aliases survive `tsc` and Node can't resolve
  them).
- **Lint / format:** oxlint + oxfmt (tabs). `npm run check` = lint +
  `format:check` + `typecheck`.
- **Tests:** vitest (`npm test`).
- **Commits:** Conventional Commits — `feat`, `fix`, `refactor`, `chore`, `perf`,
  `build`, `test`.
- **Docker:** `node:26-alpine`, multi-stage, non-root `node` user, secrets via env
  only.

## Architecture

- Feature-based folders: `src/features/<feature>/{agent,node,prompt,schema,tool}.ts`.
- Agents return **structured output** via `responseFormat: toolStrategy(schema)`;
  nodes read `result.structuredResponse`.
- Orchestration stays in the explicit `StateGraph` — keep it deterministic and
  testable. Deep agents plan inside a node; they never own the graph.
- One shared agent contract: langchain's `ReactAgent<AgentTypeConfig<T>>`,
  parameterised by the node's artifact type. `createAgent` and `createDeepAgent`
  both satisfy it without a widened `any`.
- **Deep agents only where they earn it.** Valuation, analyst, and the sentiment
  orchestrator use `createDeepAgent`; decision and summary stay `createAgent`.
- The model-call budget lives in `src/workflows/agent-guard.ts`; size budgets from
  a real trace, not a round number.
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

- Fail soft: budgets, node timeouts, and `exitBehavior: "end"` degrade a run to
  `insufficient_data` rather than throwing and taking down sibling branches.
- Only retry **transient** provider errors (see `runResearch`).

## Deep agents

- **Adopted for research agents:** valuation, analyst, and the sentiment
  orchestrator use `createDeepAgent`. **decision** and **summary** stay plain
  `createAgent`; they gain nothing.
- Native subagents: the sentiment orchestrator declares `subagents: [...]` and
  dispatches through the `task` tool instead of a hand-rolled subgraph.
- Determinism is preserved by putting the model on source _collection_ and code on
  the _number_ (`scoreSentimentSources`).
- Only trust the deep-agent branches on a **frontier model**; small/local models
  are net-negative. Every agent still carries `agentGuardMiddleware()`.
- Land changes **one agent per commit** and keep each independently revertible.
