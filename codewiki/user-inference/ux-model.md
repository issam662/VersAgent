---
layout: page
title: UX Model
---

```text
# Related Code
- `client/src/pages`
- `presentation/`
```

# UX Model

The goal of the PFE Project is to provide a seamless, "invisible" agentic experience where complex tasks are executed through simple user intents.

## Interaction Patterns

1.  **Intent-Based Input**: Users describe *what* they want to achieve, not *how* the system should do it.
2.  **Progressive Disclosure**: Only show complex details (like agent reasoning steps) when requested by the user.
3.  **Asynchronous Feedback**: Since agent tasks can be long-running, the UI provides real-time status updates (e.g., "Thinking...", "Executing Tool...", "Finalizing...").

## User Journey Map

- **Discovery**: User arrives at the landing page and views core features.
- **Initiation**: User submits a natural language prompt or selects a preset task.
- **Execution**: The system processes the request. The user sees a status indicator.
- **Verification**: The system presents the result for user confirmation or further refinement.
- **Completion**: The user accepts or corrects the output.
