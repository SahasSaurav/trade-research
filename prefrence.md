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
- **Docker:** `node:26-alpine`, non-root `node` user, secrets via env only.

## Architecture

- Feature-based folders: `src/features/<feature>/{agent,node,prompt,schema,tool}.ts`.
- Agents return **structured output** via `responseFormat: toolStrategy(schema)`;
  nodes read `result.structuredResponse`.
- Orchestration stays in the explicit `StateGraph` — keep it deterministic and
  testable.
- One shared agent contract (`ReactAgent`); nodes must not care which
  implementation they hold.
- The model-call budget lives in `src/workflows/agent-guard.ts`; size budgets from
  a real trace, not a round number.
- Configuration goes through `loadConfig`; never bake secrets or `.env`.

## Code and comment style

- Comments explain **why**, not what; keep them short.
- Prefer named exports; avoid `default` exports.
- Don't add a dependency unless it removes more complexity than it adds.

## Determinism

- Compute numbers in code, not in prompts: valuation multiples
  (`compute_valuation_multiples`) and sentiment scoring (the merge node) are
  deterministic on purpose.
- Render the report from structured artifacts, never from model prose.

## Failure handling

- Fail soft: budgets, node timeouts, and `exitBehavior: "end"` degrade a run to
  `insufficient_data` rather than throwing and taking down sibling branches.
- Only retry **transient** provider errors (see `runResearch`).

## Deep agents (if adopted)

- Keep **decision** and **summary** as plain `createAgent`; they gain nothing.
- Convert only research agents, and only on a **frontier model** — small/local
  models are net-negative.
- Introduce a shared `ResearchAgent` interface + node adapter first; the graph
  stays unaware.
- Measure depth-vs-baseline (quality, cost, latency, guard trips) and require a win
  before proceeding. Keep each step independently revertible.
