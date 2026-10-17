# Workflow

Diagrammatic companion to [ARCHITECTURE.md](ARCHITECTURE.md). The authoritative
edges live in `src/workflows/graph.ts`; this file is the picture, not the spec.

The diagrams are written in [Mermaid](https://mermaid.js.org/). GitHub renders
them inline; in VS Code install a Mermaid extension (or use the Markdown
preview) to see them.

## The graph

One explicit `StateGraph`. Four research branches fan out in parallel, the
validation node gates them, and the debate → decision → summary chain runs once.

```mermaid
flowchart TD
    START([START]) --> tickerCheck["tickerCheck<br/>ticker validation"]

    tickerCheck -->|"invalid_ticker"| END([END])
    tickerCheck -->|"running"| financialsAgent & analystAgent & sentimentAgent & marketAgent

    subgraph research["parallel research — deep agents"]
        direction LR
        financialsAgent["financialsAgent<br/>financialsSchema"]
        analystAgent["analystAgent<br/>analystReportSchema"]
        sentimentAgent["sentimentAgent<br/>orchestrator · sentimentSchema"]
        marketAgent["marketAgent<br/>marketSchema"]
    end

    financialsAgent --> dataValidation["dataValidation"]
    analystAgent --> dataValidation
    sentimentAgent --> dataValidation
    marketAgent --> dataValidation

    dataValidation -->|"analystIssues & budget left"| analystRepair["analystRepair"]
    analystRepair --> dataValidation
    dataValidation -->|"pass"| debateAgent["debateAgent<br/>orchestrator · debateSchema"]
    dataValidation -->|"no pass / no validation"| summaryAgent["summaryAgent<br/>summarySchema"]

    debateAgent --> decisionAgent["decisionAgent<br/>decisionSchema"]
    decisionAgent --> summaryAgent
    summaryAgent --> END

    classDef deep fill:#e6f2ff,stroke:#1f6feb,color:#0b2540;
    classDef plain fill:#f4f4f4,stroke:#888,color:#222;
    classDef gate fill:#fff4d6,stroke:#b8860b,color:#3d2c00;
    class financialsAgent,analystAgent,sentimentAgent,marketAgent,debateAgent deep;
    class decisionAgent,summaryAgent,analystRepair plain;
    class tickerCheck,dataValidation gate;
```

## Subagent delegation

The two orchestrators hold no tools. They dispatch native subagents through the
`task` tool and copy the returned evidence into their own structured output.

```mermaid
flowchart LR
    sentimentAgent["sentimentAgent<br/>deep orchestrator"] -->|"task · news_sentiment"| newsSentiment["news-sentiment<br/>news search"]
    sentimentAgent -->|"task · geopolitical"| geopolitical["geopolitical<br/>news search"]

    debateAgent["debateAgent<br/>deep orchestrator"] -->|"task 1 · bull (dossier)"| bull["bull<br/>no tools"]
    bull -.->|"bull case"| debateAgent
    debateAgent -->|"task 2 · bear (dossier + bull case)"| bear["bear<br/>no tools"]

    classDef deep fill:#e6f2ff,stroke:#1f6feb,color:#0b2540;
    classDef plain fill:#f4f4f4,stroke:#888,color:#222;
    class sentimentAgent,debateAgent deep;
    class newsSentiment,geopolitical,bull,bear plain;
```

## Sequence of a passing run

```mermaid
sequenceDiagram
    participant G as StateGraph
    participant F as financials
    participant A as analyst
    participant S as sentiment
    participant M as market
    participant D as debate
    participant Dec as decision
    participant Sum as summary

    Note over G,M: four research branches run in parallel
    G->>F: ticker
    G->>A: ticker
    G->>S: ticker
    G->>M: ticker
    S->>S: dispatch news_sentiment + geopolitical
    F-->>G: financials
    A-->>G: analyst
    S-->>G: sentiment (score stamped in code)
    M-->>G: market

    G->>G: dataValidation (pass)
    G->>D: research dossier
    D->>D: dispatch bull, then bear with the bull case
    D-->>G: debate

    G->>Dec: artifacts + debate
    Dec-->>G: decision (call + execution plan)

    G->>Sum: decision + artifacts
    Sum-->>G: summary (prose)
```

## State channels

Written by the node(s) named; read by downstream nodes. Names intentionally
differ from the node names (`tickerCheck` → `tickerValidation`).

| Channel                           | Writer                          | Reader                                |
| --------------------------------- | ------------------------------- | ------------------------------------- |
| `ticker`                          | caller (input)                  | every research node, validation       |
| `tickerValidation`                | `tickerCheck`                   | router                                |
| `financials`                      | `financialsAgent`               | validation, debate, decision, summary |
| `analyst`                         | `analystAgent`, `analystRepair` | validation, debate, decision, summary |
| `sentiment`                       | `sentimentAgent`                | validation, debate, decision, summary |
| `market`                          | `marketAgent`                   | validation, debate, decision, summary |
| `validation` / `validationIssues` | `dataValidation`                | router                                |
| `analystAttempts`                 | `analystRepair`                 | router                                |
| `debate`                          | `debateAgent`                   | decision, summary                     |
| `decision`                        | `decisionAgent`                 | summary, report                       |
| `summary`                         | `summaryAgent`                  | report                                |
| `workflowStatus`                  | several                         | router                                |
