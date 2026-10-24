# Trade Research

Multi-agent [LangGraph](https://langchain-ai.github.io/langgraphjs/) pipeline that
researches a stock ticker and produces a cited **buy / hold / avoid** decision,
rendered as a terminal report.

Seven agents run as nodes in one explicit graph. Four research branches fan out
in parallel (financials, sell-side analyst, sentiment, technical/market); a
validation node gates them; a bull/bear debate argues over the evidence; and the
decision and summary agents turn it into a cited call, execution levels and a
prose note. Financials, analyst, market and sentiment are deep agents, and the
debate is a deep orchestrator with native bull/bear subagents.

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design and component boundaries
- [WORKFLOW.md](WORKFLOW.md) — the agent graph in Mermaid (graph, delegation, sequence)
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
| `npm run build` | `tsc` compile to a runnable `dist/` (see note below)            |

The pipeline takes minutes; it streams `▸ <node>` lines as each node finishes,
then prints the report.

> **Build note:** `tsc` leaves the `@src/*` path aliases in the emitted `dist/`,
> which Node cannot resolve. `npm run build` therefore rewrites them to relative
> paths (`scripts/rewrite-src-aliases.mjs`), so the result runs on plain Node as
> `node dist/src/index.js` — which is what the Docker image runs. Development
> still runs from source via `tsx` (`npm start`, `npm run dev`), for speed.

## Configuration

All via environment variables (`.env`); see `.env.example` for defaults.

| Variable                         | Default                  | Meaning                                              |
| -------------------------------- | ------------------------ | ---------------------------------------------------- |
| `MODEL_PROVIDER`                 | `ollama`                 | `ollama` \| `openai` \| `xai` \| `google-genai`      |
| `MODEL_NAME`                     | `llama3.2`               | Provider model id                                    |
| `MODEL_TEMPERATURE`              | `0.7`                    | Shared by every agent                                |
| `MODEL_<AGENT>`                  | unset                    | Per-branch model, e.g. `MODEL_DECISION=openai/gpt-5` |
| `OLLAMA_BASE_URL`                | `http://localhost:11434` | Local Ollama endpoint                                |
| `OLLAMA_NUM_CTX`                 | unset                    | Context window override                              |
| `TAVILY_API_KEY`                 | —                        | Search                                               |
| `SEARCH_REFERENCE_*`             | `5 / 1 / advanced`       | `MAX_RESULTS` / `CHUNKS_PER_SOURCE` / `DEPTH`        |
| `SEARCH_NEWS_*`                  | `5 / month`              | `MAX_RESULTS` / `TIME_RANGE` (a fallback)            |
| `BUDGET_ANALYST_ATTEMPTS`        | `2`                      | Repair rounds (0 disables)                           |
| `BUDGET_RESEARCH_ATTEMPTS`       | `3`                      | Sentiment attempts, transient errors only            |
| `CONTEXT_DB_PATH`                | unset                    | SQLite store: page cache, run record, crash resume   |
| `CONTEXT_DB_PAGE_TTL_HOURS`      | `12`                     | `open_url` cache lifetime (0 = run record only)      |
| `CONTEXT_SUMMARY_TRIGGER_TOKENS` | `60000`                  | Transcript tokens before a research agent compacts   |
| `CONTEXT_KEEP_MESSAGES`          | `6`                      | Messages kept verbatim after a compaction            |
| `CONTEXT_SUMMARIZER_MODEL`       | unset                    | Model that writes the summary (default: the agent's) |

## Docker

```bash
docker build -t trade-research .
docker run --rm \
  -e MODEL_PROVIDER=openai -e MODEL_NAME=<model> \
  -e OPENAI_API_KEY=... -e TAVILY_API_KEY=... \
  -e GOOGLE_API_KEY=x -e XAI_API_KEY=x \
  trade-research
```

Multi-stage `node:26-alpine` image (deps → build → prod-deps → runtime). The runtime
stage installs production dependencies only — no compiler, no test tooling — and runs
the compiled `dist/src/index.js` on plain Node. It writes nothing to disk by default,
so there is no volume and no port. Run it as a scheduled job (Cloud Run Job / ECS
RunTask / K8s Job / cron).

To keep the context store (and resume a crashed job), mount a writable volume and
point `CONTEXT_DB_PATH` at it, e.g. `-v tr-state:/data -e
CONTEXT_DB_PATH=/data/context.db`. `better-sqlite3` ships musl prebuilds, so the
alpine image needs no build tooling for it.

## Limitations

- **Ticker is hardcoded** to `AMZN` in `src/index.ts` — not yet parameterised.
- **Default Ollama model is host-specific** (`gemma4:12b-mlx` is Apple-Silicon /
  MLX) and won't run in a Linux container; use a hosted provider in Docker.
- All provider keys must be set (see the gotcha above).
- Deep agents are used for **financials, analyst, market, and the sentiment and
  debate orchestrators**; the decision and summary agents
  stay `createAgent`. The benefit is gated on a frontier model — see
  [AGENTS.md](AGENTS.md).

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
  agents/
    ticker/                    ticker validation node
    financials/                deep agent — multiples + statements + insiders
    analyst/                   deep agent + repair node
    sentiment/                 deep orchestrator + native subagents + scorer
    market/                    deep agent — technicals, levels, trend
    debate/                    deep orchestrator + bull/bear native subagents
      subagents/bull/ bear/    bull vs. bear over the evidence, each with a risk posture
      context.ts               shared debate-dossier builder
    validation/                gates artifacts, reports issues
    decision/                  structured call + fair value + execution plan
    summary/                   prose analyst-note agent
    search/tool.ts             Tavily wrapper with query rewriting
  utils/
    indicators.ts              deterministic technical indicators (pure functions)
    yahoo/                     Yahoo payload helpers — client.ts, format.ts, utils.ts
scripts/
  rewrite-src-aliases.mjs      rewrites @src imports so the build runs on node
skills/
  <agent>/SKILL.md             the how-to for each research agent, read at runtime
```

## Prompts and skills

Every research agent splits its instructions in two:

- the **system prompt** (`src/agents/<agent>/prompt.ts`) holds the contract —
  role, scope, hard rules and guardrails;
- the **skill** (`skills/<name>/SKILL.md`) holds the procedure — search strategy,
  source hierarchy, verification steps, output contract and worked examples;
- its **references** (`skills/<name>/references/*.md`) hold the deep tables — firm
  tiers, metric definitions, grading rubrics, how the sell-side works — read on
  demand, so `SKILL.md` stays a procedure.

The skill is read from disk at runtime, through a read-only filesystem confined to
that agent's own skill folder, so it costs nothing until the agent reads it.

| Agent                     | Skill                    |
| ------------------------- | ------------------------ |
| financials (deep)         | `skills/financials/`     |
| analyst (deep)            | `skills/analyst/`        |
| market (deep)             | `skills/market/`         |
| ↳ news_sentiment subagent | `skills/news-sentiment/` |
| ↳ geopolitical subagent   | `skills/geopolitical/`   |

Each folder name must match the `name` in its frontmatter.

The sentiment orchestrator is the exception: it only delegates, so it carries no
skill — its prompt is the whole contract, and the how-to stays with the two
subagents that do the research.
