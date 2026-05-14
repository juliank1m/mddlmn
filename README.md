<p align="center">
  <img src="frontend/src/assets/mddlmn_logo.jpeg" alt="mddlmn logo" width="220" />
</p>

<h1 align="center">mddlmn</h1>

<p align="center">
  Local control layer for Anthropic API traffic from AI coding agents.
</p>

---

mddlmn runs as a pass-through proxy that captures, classifies, and optionally rewrites Anthropic API traffic. It can hold every request for user review, strip secrets before they reach the upstream model, and inject standing instructions on the way out. Captured traffic is persisted to SQLite and surfaced through a REST API, websocket feed, React inspector, and VS Code extension.

The proxy forwards requests to Anthropic with hop-by-hop HTTP headers stripped. Authentication headers are passed through from the original client; API keys are not rewritten or stored.

## What It Does

Observability:

- Proxies Anthropic API requests from tools such as Claude Code.
- Logs raw request and response pairs as JSONL under `logs/`.
- Stores sessions, requests, sections, token counts, and durations in `data/mddlmn.sqlite`.
- Classifies request/response content into system, user, injected context, tool, thinking, and assistant sections.
- Broadcasts live request updates over `/ws`.
- Serves a REST API for sessions, requests, raw logs, section diffs, and token stats.
- Provides a React traffic inspector for browsing, diffing, and visualizing captured requests.
- Provides a VS Code extension that starts the proxy, configures Claude Code's `ANTHROPIC_BASE_URL`, sets the same variable for integrated terminals, and opens the inspector in a webview.

Control:

- Middleware pipeline with inbound and outbound stages around the gate.
- Request gating: hold every request at the proxy until the user approves, edits, or aborts. Aborts return a synthetic SSE `end_turn` so the agent loop completes cleanly rather than retrying.
- Section editing: a full in-UI editor for held requests — modify text, edit JSON tool definitions, drag-reorder content blocks and messages, delete with restore, swap models.
- Server-owned canonical conversation state so user edits and aborts persist across client replays.
- Secret redaction with built-in rules (Anthropic, OpenAI-style, and AWS keys, PEM private key blocks) plus user-defined patterns; runs before the request is shown to the user or forwarded.
- Prompt injection with configurable targets (system prepend/append, last user prepend/append, new user message) and scopes (`all`, `top_level`, `tool_chain`); runs after gate approval and before forwarding.
- Memory injection: a persistent store of context snippets auto-injected through the injection pipeline, with `always` / `session` / `conditional` scopes and optional expiry.
- A settings tab in the inspector for managing redaction rules, injection rules, and memory entries.

## Project Layout

```text
.
|-- src/                  # Fastify proxy
|   |-- api/              # REST routes
|   |-- classifier/       # Request/response section parsing + token counting
|   |-- middleware/       # Inbound/outbound pipelines (redaction, injection)
|   |-- proxy/            # Handler, forwarder, gate, canonical conversation
|   |-- storage/          # SQLite + JSONL logging
|   `-- ws/               # WebSocket broadcaster
|-- frontend/             # React + Vite traffic inspector
|-- extension/            # VS Code extension shell and packaged webview assets
|-- data/                 # Local SQLite database, ignored by git
`-- logs/                 # Local JSONL session logs, ignored by git
```

## Requirements

- Node.js 22 or newer
- npm
- An Anthropic API key configured for the client you are proxying

## Install

Install the root proxy dependencies:

```sh
npm install
```

Install the frontend and extension dependencies when working on those packages:

```sh
cd frontend
npm install

cd ../extension
npm install
```

## Run The Proxy

From the repository root:

```sh
npm run dev
```

The proxy listens on port `8080` by default. Override it with `MDDLMN_PORT`:

```sh
MDDLMN_PORT=8787 npm run dev
```

Point an Anthropic-compatible client at the proxy:

```sh
export ANTHROPIC_BASE_URL=http://localhost:8080
```

Then use the client normally. mddlmn forwards traffic to `https://api.anthropic.com`, streams responses back to the client, and records the session locally.

## Control Layer

Every request passes through this pipeline before reaching Anthropic:

```
capture -> inbound middleware (redaction) -> canonical conversation
        -> gate (if armed) -> outbound middleware (injection, memory) -> forward
```

Gate. Off by default. When enabled via `POST /api/gate/enable`, the proxy holds each incoming request and emits a `request_held` websocket event. The agent blocks on the network until the UI calls approve or cancel. Approving with an edited body forwards the edited version; cancelling returns a synthetic SSE `end_turn` so the agent loop completes without retrying.

Canonical conversation. Anthropic's API is stateless, so Claude Code replays the full transcript every turn. To make user edits and aborts persist across replays, the proxy maintains its own copy of `messages` for the main conversation. Cache-control markers are normalized on the canonical view so the request never exceeds Anthropic's 4-block cache limit.

Redaction (inbound). Walks the request body's text-bearing fields — system prompt, message text blocks, and `tool_result` content — replacing matches with each rule's `replacement` string. Model name, role, tool definitions, and tool-use inputs are left untouched so structural fields cannot be broken by an over-eager pattern. Built-in rules cover Anthropic API keys, OpenAI-style keys, AWS access keys, and PEM private key blocks; built-ins can be toggled but not deleted, and their patterns are read-only.

Injection (outbound). Adds standing instructions or context after the gate approves and before the request is forwarded. Each rule has a `target` (`system_prepend`, `system_append`, `user_prepend`, `user_append`, `new_user_message`) and an `applyTo` scope (`all`, `top_level`, `tool_chain`). Auxiliary requests such as title generation are never injected.

Memory (outbound). A persistent store of context snippets that are auto-injected through the same apply logic as injection rules, running just after injection. Each entry has a `scope`: `always` (every request), `session` (RAM-only, gone on proxy restart), or `conditional` (injected only when a regex matches the last user message). Expired entries (`expiresAt`) are skipped.

## Run The Frontend

Start the proxy first, then run the inspector:

```sh
cd frontend
npm run dev
```

The Vite dev server uses port `5173` and proxies `/api` and `/ws` to `http://localhost:8080`.

Build the production frontend:

```sh
cd frontend
npm run build
```

## VS Code Extension

The extension lives in `extension/`. On activation it:

- starts the local proxy on an available port
- injects `ANTHROPIC_BASE_URL` into Claude Code's `claudeCode.environmentVariables`
- injects `ANTHROPIC_BASE_URL` into VS Code integrated terminals
- shows a status bar item with the active proxy port
- opens the React inspector in a webview
- relays webview REST and websocket traffic to the local proxy

### Install

Package and install the VSIX:

```sh
cd frontend && npm run build
cp -r dist/* ../extension/webview-dist/
cd ../extension && npm run package
code --install-extension mddlmn-0.1.1.vsix
```

`npm run package` compiles the extension, copies and recompiles the proxy (including rebuilding `better-sqlite3` against Electron's Node), and produces the VSIX. Reload VS Code after installing.

### Development

For iterating on the extension TypeScript without packaging:

```sh
cd extension
npm run build   # or: npm run watch
```

Open the `extension/` folder in VS Code and use the included launch configuration to run the extension in a development host.

## API

The proxy reserves `/api/*` and `/ws`; all other paths are forwarded upstream to Anthropic.

Observability endpoints:

- `GET /api/sessions`
- `GET /api/sessions/:id`
- `GET /api/sessions/:id/requests`
- `GET /api/requests/:id`
- `GET /api/requests/:id/raw`
- `GET /api/requests/:id/sections`
- `GET /api/diff/:idA/:idB`
- `GET /api/stats/tokens/:sessionId`

Gate endpoints:

- `GET  /api/gate/status` — current enabled flag, queue length, and held request id
- `POST /api/gate/enable`
- `POST /api/gate/disable`
- `POST /api/gate/:requestId/approve` — body may include `{ body: AnthropicRequest }` to forward an edited version
- `POST /api/gate/:requestId/cancel` — returns a synthetic abort to the agent

Redaction rule endpoints:

- `GET    /api/redaction/rules`
- `POST   /api/redaction/rules`
- `PATCH  /api/redaction/rules/:id` — built-in rules can be toggled but their pattern is read-only
- `DELETE /api/redaction/rules/:id` — built-in rules cannot be deleted

Injection rule endpoints:

- `GET    /api/injection/rules`
- `POST   /api/injection/rules`
- `PATCH  /api/injection/rules/:id`
- `DELETE /api/injection/rules/:id`

Memory entry endpoints:

- `GET    /api/memory`
- `POST   /api/memory` — server assigns `id` and `createdAt`
- `PATCH  /api/memory/:id`
- `DELETE /api/memory/:id`

Websocket endpoint:

- `GET /ws`

Websocket events:

- `new_request` — proxied request captured
- `request_classified` — response captured and sections stored
- `request_held` — gate is holding a request awaiting decision
- `request_released` — held request approved or cancelled
- `gate:status` — gate enabled state or queue length changed
- `redaction:hits` — one or more inbound redaction rules fired on a request
- `injection:applied` — one or more outbound injection rules fired on a request
- `memory:injected` — one or more memory entries were injected into a request

## Data Model

Each proxy process creates a session. A session has many requests, and each request has ordered sections. Raw request/response pairs are written to JSONL first; normalized request metadata and classified sections are stored in SQLite for fast querying.

Runtime configuration (redaction rules, injection rules, memory entries) lives outside the repo in `~/.mddlmn/` so it survives extension reinstalls. Override with the `MDDLMN_CONFIG_DIR` environment variable. Session-scoped memory entries are never written to disk — they live only in RAM and are gone on proxy restart.

Local runtime files are intentionally ignored by git:

- `logs/`
- `data/`
- `dist/`
- `node_modules/`
- `.env`
- `*.tsbuildinfo`
- `extension/proxy-dist/` — generated by `npm run package`
- `extension/webview-dist/` — copied from `frontend/dist/` during packaging

## Build

Run the root TypeScript build:

```sh
npm run build
```

Build and package everything (proxy + frontend + VSIX):

```sh
npm run build
cd frontend && npm run build && cp -r dist/* ../extension/webview-dist/
cd ../extension && npm run package
```

## Notes

mddlmn is a local developer tool. It records full prompts, tool results, and model responses in `logs/` and `data/`, so treat those files as sensitive. Do not commit local runtime data.
