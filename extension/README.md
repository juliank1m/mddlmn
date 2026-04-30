# mddlmn VS Code Extension

This is the VS Code shell for mddlmn. On activation it:

- starts the local proxy server on an available port
- injects `ANTHROPIC_BASE_URL` into integrated terminals
- shows the active proxy port in the status bar
- opens the React inspector in a webview panel
- bridges webview REST and websocket traffic to the local proxy

## Development

```sh
npm install
npm run build
```

For local debugging, open this folder in VS Code and run the included extension launch configuration.
