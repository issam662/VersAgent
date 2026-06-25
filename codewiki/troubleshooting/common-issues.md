---
layout: page
title: Common Issues
---

```text
# Related Code
- `agent.log`
- `server.log`
```

# Common Issues

A collection of frequently encountered problems and their solutions.

## Troubleshooting Guide

### 1. Agent Hanging/Looping
- **Symptoms**: The agent is "thinking" for more than 60 seconds without making a tool call.
- **Cause**: Conflicting instructions in the prompt or ambiguous user intent.
- **Fix**: Refine the system prompt or provide more specific examples (few-shot).

### 2. Connection Refused (Backend)
- **Symptoms**: Client cannot reach the server.
- **Cause**: Server is down or listening on the wrong port.
- **Fix**: Check `server.log` and ensure `PORT` is correctly set in `.env`.

### 3. Tool Execution Error
- **Symptoms**: Agent reports a tool failed to run.
- **Cause**: Invalid API keys or network issues with the target service.
- **Fix**: Verify the tool's configuration in `agent/src/tools`.

### 4. Database Connection Pool Exhausted
- **Symptoms**: Server requests are hanging or timing out.
- **Cause**: Too many concurrent connections from the Agent/Server.
- **Fix**: Increase the database pool size in the server configuration.
