---
layout: page
title: Logging, Metrics, & Tracing
---

```text
# Related Code
- `agent.log`
- `server.log`
- `client.log`
```

# Logging, Metrics, & Tracing

Observability in the PFE Project focuses on tracing the flow of an intent from the user's click to the agent's final action.

## Signals and Tools

- **Logs**: Structured JSON logs are emitted by all layers (Client, Server, Agent).
- **Metrics**: We track Request Latency, Agent Reasoning Time, and Tool Success Rates.
- **Tracing**: Distributed tracing (OpenTelemetry) is used to follow Request IDs across service boundaries.

## Critical Dashboards

- **Agent Health**: Monitors the number of active tasks vs. completed tasks.
- **Error Rate**: Tracks 5xx errors in the Server and Exception rates in the Agent.
- **Latency Heatmap**: Visualizes the time taken for different categories of agentic tasks.

## Alerting Philosophy

- **Immediate Alerts**: Triggered by critical service failures (e.g., Server down, DB connection lost).
- **Warning Alerts**: Triggered by high latency or repeated agent reasoning failures (potential loops).
- **Low Priority**: Informational logs regarding successful task completions.
