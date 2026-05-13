# mddlmn

**A local control layer for Claude Code and Anthropic API traffic.**
Inspect, edit, redact, inject, and gate every request before it reaches the model.

---

## What is mddlmn?

**mddlmn** (middleman) is a local-only proxy that sits between an Anthropic-API-compatible client — Claude Code, the Anthropic SDK, your own agent — and `api.anthropic.com`. It captures every request and response, classifies what's inside, and gives you a side-panel UI to inspect, edit, hold, redact, or inject traffic before it goes upstream.

This extension is the VS Code shell. On activation it:

- Starts the local mddlmn proxy on an available port
- Injects `ANTHROPIC_BASE_URL` into Claude Code's settings and your integrated terminals — no manual env-var setup
- Opens the inspector in a webview panel
- Shows the active proxy port in the status bar

Your API key is never read or stored — auth headers pass through unchanged.

---

## Features

### See everything

- **Per-section classification**: every captured turn is broken into system prompt, tool definitions, user text, injected context, assistant text, tool-use, tool-result, and extended thinking blocks
- **Token counts** per section, per turn, per session
- **Live updates** over WebSocket as new requests land
- **Diff** any two requests side-by-side to see what changed
- **Timeline** view of a whole session

### Change everything

- **Gate**: arm the gate to hold every outgoing request until you approve, edit, or abort it. The agent loop blocks cleanly on the network rather than spinning.
- **Section editing**: full in-UI editor for held requests — modify text, drag-reorder content blocks and messages, delete (with restore), edit JSON tool definitions, swap models from a dropdown
- **Secret redaction**: built-in patterns strip Anthropic / OpenAI / AWS keys and PEM private key blocks before the request is shown or forwarded. Add your own rules at any time.
- **Prompt injection**: append standing context to the system prompt, prepend to the last user message, or insert a new user turn — scoped to top-level conversations, tool-chain steps, or both
- **Synthetic abort**: cancelling a held request returns a clean SSE `end_turn` so the agent loop completes instead of retrying

### Honest about what's what

Every held request shows a `TOP` / `TOOL` / `AUX` badge and the model name in the header — so when Claude Code fires a haiku summarization probe alongside your main opus generation, you know which one you're editing.

---

## Quick start

1. Install the extension and reload VS Code
2. The proxy starts automatically; `ANTHROPIC_BASE_URL` is injected into Claude Code and new terminals
3. Use Claude Code or any Anthropic-API-compatible client normally — every request is captured
4. Open the panel: **Command Palette → "mddlmn: Open Panel"**
5. Click **GATE** in the header to start intercepting requests

---

## How it works

```
agent → mddlmn proxy → api.anthropic.com
        │
        ├─ inbound middleware  (redaction)
        ├─ canonical conversation
        ├─ gate (hold for approval / edits)
        └─ outbound middleware (injection)
```

The proxy maintains its own canonical copy of the conversation, so edits and aborts persist across the client's stateless replays. Cache-control markers are normalized so requests never exceed Anthropic's 4-block cache limit. Aborts return a synthetic SSE `end_turn` so the agent loop completes naturally.

---

## Where data lives

Everything stays on your machine, at `~/.mddlmn/`:

| | |
|---|---|
| Session logs (JSONL) | `~/.mddlmn/logs/` |
| Captured request store | `~/.mddlmn/data/mddlmn.sqlite` |
| Redaction rules | `~/.mddlmn/redaction-rules.json` |
| Injection rules | `~/.mddlmn/injection-rules.json` |

Override the root with the `MDDLMN_CONFIG_DIR` environment variable.

---

## Privacy

- 100% local. No telemetry. No cloud calls except to the upstream Anthropic API on your behalf.
- Your API key is passed through verbatim — mddlmn never reads or stores it.
- Captured prompts, tool outputs, and model responses are written to local files. Treat them as sensitive.

---

## Source

Open source: [github.com/juliank1m/mddlmn](https://github.com/juliank1m/mddlmn)

Issues and feature requests welcome.
