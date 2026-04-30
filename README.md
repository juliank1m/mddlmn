<p align="center">
  <img src="frontend/src/assets/mddlmn_logo.jpeg" alt="mddlmn logo" width="220" />
</p>

<h1 align="center">mddlmn</h1>

<p align="center">
  Local observability for Anthropic API traffic from AI coding agents.
</p>

---

mddlmn runs as a pass-through proxy, captures request and response payloads, classifies prompt sections, stores sessions in SQLite, and exposes the captured traffic through a REST API, websocket feed, React inspector, and VS Code extension.

The proxy forwards requests to Anthropic unchanged apart from hop-by-hop HTTP headers. Authentication headers are passed through from the original client; API keys are not rewritten or stored.

## What It Does

- Proxies Anthropic API requests from tools such as Claude Code.
- Logs raw request and response pairs as JSONL under `logs/`.
- Stores sessions, requests, sections, token counts, and durations in `data/mddlmn.sqlite`.
- Classifies request/response content into system, user, injected context, tool, thinking, and assistant sections.
- Broadcasts live request updates over `/ws`.
- Serves a REST API for sessions, requests, raw logs, section diffs, and token stats.
- Provides a React traffic inspector for browsing, diffing, and visualizing captured requests.
- Provides a VS Code extension that starts the proxy, sets `ANTHROPIC_BASE_URL` for integrated terminals, and opens the inspector in a webview.

## Project Layout

```text
.
|-- src/                  # Fastify proxy, storage, classifier, REST API, websocket server
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
- injects `ANTHROPIC_BASE_URL` into VS Code integrated terminals
- shows a status bar item with the active proxy port
- opens the React inspector in a webview
- relays webview REST and websocket traffic to the local proxy

Build it with:

```sh
cd extension
npm run build
```

For extension development, open the extension folder in VS Code and use the included launch configuration.

## API

The proxy reserves `/api/*` and `/ws`; all other paths are forwarded upstream to Anthropic.

REST endpoints:

- `GET /api/sessions`
- `GET /api/sessions/:id`
- `GET /api/sessions/:id/requests`
- `GET /api/requests/:id`
- `GET /api/requests/:id/raw`
- `GET /api/requests/:id/sections`
- `GET /api/diff/:idA/:idB`
- `GET /api/stats/tokens/:sessionId`

Websocket endpoint:

- `GET /ws`

Websocket events:

- `new_request`: emitted as soon as a proxied request is captured
- `request_classified`: emitted after the response is captured and sections are stored

## Data Model

Each proxy process creates a session. A session has many requests, and each request has ordered sections. Raw request/response pairs are written to JSONL first; normalized request metadata and classified sections are stored in SQLite for fast querying.

Local runtime files are intentionally ignored by git:

- `logs/`
- `data/`
- `dist/`
- `node_modules/`
- `.env`
- `*.tsbuildinfo`

## Build

Run the root TypeScript build:

```sh
npm run build
```

Build all packages:

```sh
npm run build
cd frontend && npm run build
cd ../extension && npm run build
```

## Notes

mddlmn is a local developer tool. It records full prompts, tool results, and model responses in `logs/` and `data/`, so treat those files as sensitive. Do not commit local runtime data.
