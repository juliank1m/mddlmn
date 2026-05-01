import { cpSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const proxyRoot = resolve(__dirname, "../..");
const dest = resolve(__dirname, "../proxy-dist");

rmSync(dest, { recursive: true, force: true });

cpSync(resolve(proxyRoot, "dist"), resolve(dest, "dist"), { recursive: true });
cpSync(resolve(proxyRoot, "node_modules"), resolve(dest, "node_modules"), { recursive: true });
cpSync(resolve(proxyRoot, "package.json"), resolve(dest, "package.json"));

console.log("Copied proxy into extension/proxy-dist/");

// Rebuild better-sqlite3 against Electron's Node (different NODE_MODULE_VERSION than system Node).
const ELECTRON_VERSION = "39.8.8";
console.log(`Rebuilding better-sqlite3 for Electron ${ELECTRON_VERSION}...`);
execSync(
  `node-gyp rebuild --release --runtime=electron --target=${ELECTRON_VERSION} --disturl=https://electronjs.org/headers --arch=arm64`,
  { cwd: resolve(dest, "node_modules/better-sqlite3"), stdio: "inherit" }
);
console.log("better-sqlite3 rebuilt for Electron.");
