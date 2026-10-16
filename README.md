# Trade Research

Multi-agent [LangGraph](https://langchain-ai.github.io/langgraphjs/) pipeline that
researches a stock ticker and produces a cited **buy / hold / avoid** decision,
rendered as a terminal report.

Six agents run as nodes in one explicit graph: three research branches fan out in
parallel (valuation, sell-side analyst, sentiment), a validation node gates them,
and a decision agent synthesises the result. Valuation and analyst are deep agents,
and sentiment is a deep orchestrator with native subagents.

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design and component boundaries
- [AGENTS.md](AGENTS.md) — project instructions and the agents
- [prefrence.md](prefrence.md) — conventions and preferences

## Requirements

- **Node 26** (the toolchain targets `typescript ^7`, `@types/node ^26`)
- **Tavily API key** (web search)
- A **model provider**: `ollama` (default, local) or a hosted key for
  `openai` / `xai` / `google-genai`

## Setup

```bash
cp .env.example .env
# fill in the keys, then:
npm install
```

> **Gotcha:** `loadConfig` (`src/config/config.ts`) validates **every** provider key
> with `min(1)`, regardless of the active `MODEL_PROVIDER`. All of
> `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `TAVILY_API_KEY` must be
> non-empty or the run throws at startup. Only the active provider's key is used.

## Usage

| Command         | What it does                                                    |
| --------------- | --------------------------------------------------------------- |
| `npm run dev`   | Run the pipeline once (ticker is `AMZN`, set in `src/index.ts`) |
| `npm start`     | Same, via `tsx`                                                 |
| `npm test`      | Vitest suite                                                    |
| `npm run check` | Lint + format check + typecheck                                 |
| `npm run build` | `tsc` compile to `dist/` (see note below)                       |

The pipeline takes minutes; it streams `▸ <node>` lines as each node finishes,
then prints the report.

> **Build note:** `tsc` leaves the `@src/*` path aliases in the emitted `dist/`,
> which Node cannot resolve. The app therefore **runs from source via `tsx`**
> (`npm start`, and the Docker image), which resolves the aliases. `dist/` is not
> a runnable artifact.

## Configuration

All via environment variables (`.env`); see `.env.example` for defaults.

| Variable                   | Default                  | Meaning                                         |
| -------------------------- | ------------------------ | ----------------------------------------------- |
| `MODEL_PROVIDER`           | `ollama`                 | `ollama` \| `openai` \| `xai` \| `google-genai` |
| `MODEL_NAME`               | `llama3.2`               | Provider model id                               |
| `MODEL_TEMPERATURE`        | `0.7`                    | Shared by all six agents                        |
| `OLLAMA_BASE_URL`          | `http://localhost:11434` | Local Ollama endpoint                           |
| `OLLAMA_NUM_CTX`           | unset                    | Context window override                         |
| `TAVILY_API_KEY`           | —                        | Search                                          |
| `SEARCH_REFERENCE_*`       | `5 / 1 / advanced`       | `MAX_RESULTS` / `CHUNKS_PER_SOURCE` / `DEPTH`   |
| `SEARCH_NEWS_*`            | `5 / day`                | `MAX_RESULTS` / `TIME_RANGE`                    |
| `BUDGET_ANALYST_ATTEMPTS`  | `2`                      | Repair rounds (0 disables)                      |
| `BUDGET_RESEARCH_ATTEMPTS` | `3`                      | Sentiment retry attempts                        |

## Docker

```bash
docker build -t trade-research .
docker run --rm \
  -e MODEL_PROVIDER=openai -e MODEL_NAME=<model> \
  -e OPENAI_API_KEY=... -e TAVILY_API_KEY=... \
  -e GOOGLE_API_KEY=x -e XAI_API_KEY=x \
  trade-research
```

Multi-stage `node:26-alpine` image (deps + runtime), non-root, runs `tsx` from
source. It writes nothing to disk, so there is no volume and no port. Run it as a
scheduled job (Cloud Run Job / ECS RunTask / K8s Job / cron).

## Limitations

- **Ticker is hardcoded** to `AMZN` in `src/index.ts` — not yet parameterised.
- **Default Ollama model is host-specific** (`gemma4:12b-mlx` is Apple-Silicon /
  MLX) and won't run in a Linux container; use a hosted provider in Docker.
- All provider keys must be set (see the gotcha above).
- Deep agents are used for **valuation, analyst, and the sentiment orchestrator**
  only; decision and summary stay `createAgent`. The benefit is gated on a frontier
  model — see [AGENTS.md](AGENTS.md).

## Project layout

```
src/
  index.ts                     CLI entry: stream the graph, render the report
  config/config.ts             env schema + loader
  report/render.ts             terminal report rendering
  workflows/
    graph.ts                   the StateGraph (nodes + edges)
    workflow.ts                builds model, tools, agents
    state.ts                   WorkflowState channels
    skills.ts                  skill constants (root, tools, permissions)
  features/
    ticker/                    ticker validation node
    valuation/                 deep agent + compute_valuation_multiples tool
    analyst/                   deep agent + repair node
    sentiment/                 deep orchestrator + native subagents + scorer
    validation/                gates artifacts, reports issues
    decision/                  structured recommendation agent
    summary/                   prose analyst-note agent
    search/tool.ts             Tavily wrapper with query rewriting
skills/
  <agent>/SKILL.md             the how-to for each research agent, read at runtime
```

## Prompts and skills

Every research agent splits its instructions in two:

- the **system prompt** (`src/features/<feature>/prompt.ts`) holds the contract —
  role, scope, hard rules and guardrails;
- the **skill** (`skills/<name>/SKILL.md`) holds the procedure — search strategy,
  source hierarchy, verification steps, output contract and worked examples;
- its **reference** (`skills/<name>/references/reference.md`) holds the deep
  tables — firm tiers, metric definitions, grading rubrics — read on demand, so
  `SKILL.md` stays a procedure.

The skill is read from disk at runtime, through a read-only filesystem confined to
that agent's own skill folder, so it costs nothing until the agent reads it.

| Agent                         | Skill                    |
| ----------------------------- | ------------------------ |
| valuation (deep)              | `skills/valuation/`      |
| analyst (deep)                | `skills/analyst/`        |
| sentiment orchestrator (deep) | `skills/sentiment/`      |
| ↳ news_sentiment subagent     | `skills/news-sentiment/` |
| ↳ geopolitical subagent       | `skills/geopolitical/`   |

Each folder name must match the `name` in its frontmatter.
