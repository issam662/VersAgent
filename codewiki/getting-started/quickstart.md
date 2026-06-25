---
layout: page
title: Quickstart
---

```text
# Related Code
- `package.json`
- `client/`
- `server/`
- `agent/`
```

# Quickstart Guide

This guide will get your local development environment up and running in less than 10 minutes.

## Prerequisites

- **Node.js**: v18+ (LTS recommended)
- **Python**: 3.10+
- **NPM/Yarn**: For frontend and backend package management

## Local Setup

Follow these steps to launch the application in development mode.

### 1. Clone and Install
Navigate to the root directory and install dependencies for all modules.

```bash
npm install
cd client && npm install
cd ../server && npm install
```

### 2. Environment Configuration
Ensure you have a `.env` file in the `server` directory. You can copy the example:

```bash
cp server/.env.example server/.env
```

### 3. Launch the Services
Open three separate terminal windows:

**Terminal 1: Frontend (Client)**
```bash
cd client
npm run dev
```
*Expected Output*: `Local: http://localhost:5173/`

**Terminal 2: Backend (Server)**
```bash
cd server
npm run dev
```
*Expected Output*: `Server running on port 3000`

**Terminal 3: Agent Worker**
```bash
cd agent
python main.py
```

## First Hour Exploration

Once the services are up, explore these key areas:
- `client/src/pages`: View the core UI layouts.
- `server/src/routes`: Understand the API surface.
- `agent/src/main.ts`: See how the agentic logic is initialized.
- `presentation/`: Inspect the shared assets and UI components.
