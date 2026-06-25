---
layout: page
title: Plugins Overview
---

```text
# Related Code
- `agent/src/tools`
- `codewiki/plugins/`
```

# Plugins Overview

Plugins are modular extensions that allow the Agent to interact with external systems or provide specialized domain knowledge.

## Plugin Lifecycle

1.  **Registration**: Plugins are discovered during the Agent's startup sequence.
2.  **Capability Mapping**: The Agent maps user intents to specific plugin capabilities.
3.  **Execution**: When a task requires a tool, the Agent invokes the corresponding plugin.
4.  **Completion**: The plugin returns a structured response which the Agent then interprets into the final output.

## Extension Points

- **Tool Definitions**: New tools can be added by creating a new script in `agent/src/tools`.
- **Custom Prompt Templates**: Plugins can provide specific system prompts for specialized tasks.
- **UI Widgets**: Plugins can register new interactive elements for the React client.

## Compatibility Constraints

- Plugins must adhere to the standard JSON response schema.
- Execution time limits are enforced per plugin call to prevent agent "hangs."
