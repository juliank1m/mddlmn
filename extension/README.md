# mddlmn VS Code Extension

This is the VS Code shell for mddlmn. On activation it:

- starts the local proxy server on an available port
- injects `ANTHROPIC_BASE_URL` into integrated terminals
- opens a webview panel with a postMessage bridge for REST and websocket traffic

The React frontend lands in Step 6. Until then, the webview is a small status page that exercises the same bridge contract the frontend will use.
