import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import * as vscode from "vscode";
import type { WebSocket as WebSocketType } from "ws";

type WebviewMessage =
  | { type: "ready" }
  | {
      type: "fetch";
      id: string;
      endpoint: string;
      init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      };
    }
  | { type: "ws:connect" }
  | { type: "ws:disconnect" };

let proxyProcess: ChildProcessWithoutNullStreams | undefined;
let proxyPort: number | undefined;
let panel: vscode.WebviewPanel | undefined;
let upstreamSocket: WebSocketType | undefined;
let output: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  output = vscode.window.createOutputChannel("mddlmn");
  context.subscriptions.push(output);

  proxyPort = await findAvailablePort();
  startProxy(context, proxyPort);
  injectAnthropicBaseUrl(context, proxyPort);

  // Status bar item shows the proxy URL at a glance and lets the user copy it.
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = `$(radio-tower) mddlmn :${proxyPort}`;
  statusBar.tooltip = `mddlmn proxy running on http://localhost:${proxyPort}\nClick to copy ANTHROPIC_BASE_URL export command`;
  statusBar.command = "mddlmn.copyBaseUrl";
  statusBar.show();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("mddlmn.openPanel", () => {
      openPanel(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mddlmn.copyBaseUrl", async () => {
      if (!proxyPort) return;
      const exportCmd = `export ANTHROPIC_BASE_URL=http://localhost:${proxyPort}`;
      await vscode.env.clipboard.writeText(exportCmd);
      vscode.window.showInformationMessage(
        `Copied! Paste into your terminal:\n${exportCmd}`,
        "Open New Terminal"
      ).then((choice) => {
        if (choice === "Open New Terminal") {
          const terminal = vscode.window.createTerminal("mddlmn");
          terminal.sendText(exportCmd);
          terminal.show();
        }
      });
    })
  );

  // Notify the user that existing terminals need to be restarted.
  vscode.window.showInformationMessage(
    `mddlmn proxy started on port ${proxyPort}. Open a new terminal — ANTHROPIC_BASE_URL is set automatically.`,
    "Open Terminal",
    "Open Panel"
  ).then((choice) => {
    if (choice === "Open Terminal") {
      const terminal = vscode.window.createTerminal("mddlmn");
      terminal.sendText(`export ANTHROPIC_BASE_URL=http://localhost:${proxyPort}`);
      terminal.show();
    } else if (choice === "Open Panel") {
      openPanel(context);
    }
  });

  context.subscriptions.push({
    dispose: () => {
      closeUpstreamSocket();
      stopProxy();
    },
  });
}

export function deactivate(): void {
  closeUpstreamSocket();
  stopProxy();
}

async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a proxy port")));
        return;
      }

      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function startProxy(context: vscode.ExtensionContext, port: number): void {
  const proxyRoot = resolveProxyRoot(context);
  const compiledEntry = path.join(proxyRoot, "dist", "index.js");
  const tsxBin = process.platform === "win32" ? "tsx.cmd" : "tsx";
  const tsxEntry = path.join(proxyRoot, "node_modules", ".bin", tsxBin);

  const command = fileExists(compiledEntry) ? process.execPath : tsxEntry;
  const args = fileExists(compiledEntry)
    ? [compiledEntry]
    : [path.join(proxyRoot, "src", "index.ts")];

  proxyProcess = spawn(command, args, {
    cwd: proxyRoot,
    env: {
      ...process.env,
      MDDLMN_PORT: String(port),
    },
  });

  output.appendLine(`[extension] Starting proxy on port ${port}`);

  proxyProcess.stdout.on("data", (chunk: Buffer) => {
    output.append(chunk.toString());
  });

  proxyProcess.stderr.on("data", (chunk: Buffer) => {
    output.append(chunk.toString());
  });

  proxyProcess.on("error", (err) => {
    output.appendLine(`[extension] Failed to start proxy: ${err.message}`);
    vscode.window.showErrorMessage(`mddlmn proxy failed to start: ${err.message}`);
    proxyProcess = undefined;
    postPanelState();
  });

  proxyProcess.on("exit", (code, signal) => {
    output.appendLine(`[extension] Proxy exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    proxyProcess = undefined;
    postPanelState();
  });

  postPanelState();
}

function resolveProxyRoot(context: vscode.ExtensionContext): string {
  const candidates = [
    path.resolve(context.extensionPath, ".."),
    context.extensionPath,
    ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
  ];

  for (const candidate of candidates) {
    if (
      fileExists(path.join(candidate, "package.json")) &&
      (fileExists(path.join(candidate, "dist", "index.js")) ||
        fileExists(path.join(candidate, "src", "index.ts")))
    ) {
      return candidate;
    }
  }

  return path.resolve(context.extensionPath, "..");
}

function stopProxy(): void {
  if (!proxyProcess) {
    return;
  }

  proxyProcess.kill();
  proxyProcess = undefined;
}

function injectAnthropicBaseUrl(context: vscode.ExtensionContext, port: number): void {
  const baseUrl = `http://localhost:${port}`;
  const collection = context.environmentVariableCollection;
  collection.replace("ANTHROPIC_BASE_URL", baseUrl);
  collection.description = "Routes Anthropic API traffic through the local mddlmn proxy.";

  output.appendLine(`[extension] Injected ANTHROPIC_BASE_URL=${baseUrl}`);
}

function openPanel(context: vscode.ExtensionContext): void {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    "mddlmn.panel",
    "mddlmn",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, "webview-dist")),
      ],
    }
  );

  panel.webview.html = getWebviewHtml(panel.webview, context.extensionPath);
  panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
    void handleWebviewMessage(message);
  });

  panel.onDidDispose(() => {
    panel = undefined;
    closeUpstreamSocket();
  });
}

async function handleWebviewMessage(message: WebviewMessage): Promise<void> {
  if (!panel || !proxyPort) {
    return;
  }

  switch (message.type) {
    case "ready":
      postPanelState();
      return;

    case "fetch":
      await relayFetch(message);
      return;

    case "ws:connect":
      await connectUpstreamSocket(proxyPort);
      return;

    case "ws:disconnect":
      closeUpstreamSocket();
      return;
  }
}

async function relayFetch(message: Extract<WebviewMessage, { type: "fetch" }>): Promise<void> {
  if (!panel || !proxyPort) {
    return;
  }

  try {
    const endpoint = normalizeApiEndpoint(message.endpoint);
    const response = await fetch(`http://127.0.0.1:${proxyPort}${endpoint}`, {
      method: message.init?.method ?? "GET",
      headers: message.init?.headers,
      body: message.init?.body,
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? JSON.parse(text) : text;

    await panel.webview.postMessage({
      type: "fetch:response",
      id: message.id,
      ok: response.ok,
      status: response.status,
      body,
    });
  } catch (err) {
    await panel.webview.postMessage({
      type: "fetch:error",
      id: message.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function connectUpstreamSocket(port: number): Promise<void> {
  if (!panel || upstreamSocket) {
    return;
  }

  const { WebSocket } = await import("ws");
  upstreamSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  upstreamSocket.on("open", () => {
    void panel?.webview.postMessage({ type: "ws:status", status: "open" });
  });

  upstreamSocket.on("message", (data) => {
    let event: unknown = data.toString();
    try {
      event = JSON.parse(data.toString());
    } catch {
      // Leave non-JSON payloads as strings.
    }

    void panel?.webview.postMessage({ type: "ws:event", event });
  });

  upstreamSocket.on("close", () => {
    upstreamSocket = undefined;
    void panel?.webview.postMessage({ type: "ws:status", status: "closed" });
  });

  upstreamSocket.on("error", (err) => {
    void panel?.webview.postMessage({
      type: "ws:error",
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

function closeUpstreamSocket(): void {
  if (!upstreamSocket) {
    return;
  }

  upstreamSocket.close();
  upstreamSocket = undefined;
}

function normalizeApiEndpoint(endpoint: string): string {
  const pathOnly = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (!pathOnly.startsWith("/api/")) {
    throw new Error(`Webview fetch endpoint must start with /api/: ${endpoint}`);
  }

  return pathOnly;
}

function postPanelState(): void {
  void panel?.webview.postMessage({
    type: "state",
    proxy: {
      port: proxyPort,
      baseUrl: proxyPort ? `http://localhost:${proxyPort}` : null,
      running: Boolean(proxyProcess),
    },
  });
}

function getWebviewHtml(webview: vscode.Webview, extensionPath: string): string {
  const distDir = path.join(extensionPath, "webview-dist");
  const nonce = createNonce();

  // Parse the Vite-built index.html to extract hashed asset filenames.
  const indexHtml = readFileSync(path.join(distDir, "index.html"), "utf8");

  const jsMatch = indexHtml.match(/src="(\/assets\/[^"]+\.js)"/);
  const cssMatch = indexHtml.match(/href="(\/assets\/[^"]+\.css)"/);

  if (!jsMatch || !cssMatch) {
    return `<html><body>Build assets not found. Run: cd frontend && npm run build</body></html>`;
  }

  // Convert local file paths to webview URIs that VS Code will serve.
  const jsUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(distDir, jsMatch[1]))
  );
  const cssUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(distDir, cssMatch[1]))
  );

  // Google Fonts is loaded from the CDN. The CSP must allow it.
  // script-src needs 'unsafe-inline' because Vite inlines a small bootstrap snippet,
  // but we scope it with a nonce on the module script tag.
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="
      default-src 'none';
      style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com;
      font-src https://fonts.gstatic.com;
      script-src ${webview.cspSource} 'nonce-${nonce}';
      connect-src http://127.0.0.1:* ws://127.0.0.1:*;
      img-src ${webview.cspSource} data:;
    "
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>mddlmn</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let i = 0; i < 32; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}

function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}
