---
layout: page
title: Runbook
---

```text
# Related Code
- `server/`
- `agent/`
```

# Runbook

This document provides procedures for diagnosing and resolving common production issues.

## Incident Checklist

1.  **Identify Scope**: Is the issue affecting all users or specific tasks?
2.  **Check Logs**: Inspect `server.log` and `agent.log` for recent stack traces.
3.  **Verify Connectivity**: Ensure DB and External APIs are reachable.
4.  **Check Resource Usage**: Monitor CPU/Memory on Agent and Server nodes.
5.  **Restart Services**: If a process is hung, restart the specific container.

## Common Failure Modes

| Issue | Potential Cause | Resolution |
| :--- | :--- | :--- |
| Agent Timeout | Reasoning loop or heavy tool execution | Kill task, inspect `agent.log`, refine prompt |
| 500 Internal Error | Server crash or DB connection loss | Check `server.log`, restart server container |
| UI Not Loading | Frontend deployment error | Check CDN status / build logs |
| Tool Failure | External API down or changed | Update tool registry / verify API keys |
