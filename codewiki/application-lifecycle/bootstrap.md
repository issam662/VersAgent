---
layout: page
title: Application Bootstrap
---

```text
# Related Code
- `agent/src/main.ts`
- `server/src/index.ts`
- `client/src/main.tsx`
```

# Application Bootstrap

Understanding how the system initializes is key to debugging startup failures.

## Startup Sequence

1.  **Client Initialization**:
    The React app loads first, establishing a connection to the Backend. It fetches the initial configuration and user state.
2.  **Server Startup**:
    The Node.js server initializes, connects to the database, loads environment variables, and starts the Express listener.
3.  **Agent Worker Activation**:
    The Agent worker starts as a background process, subscribing to the task queue and preparing for incoming requests.

## Dependency Initialization

- **Database**: The Server validates the database connection before accepting any traffic.
- **Redis/Message Queue**: (If used) The queue must be active for the Agent to receive tasks.
- **Agent Tools**: The Agent initializes its "Tool Registry" by scanning the `agent/src/tools` directory.

## Configuration Loading

Configuration is managed via:
- **Environment Variables**: For secrets and environment-specific URLs.
- **Dynamic Config**: The Client fetches specific "Feature Flags" and "System Settings" from the Server upon launch.
