import { cpSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const proxyRoot = resolve(__dirname, "../..");
const dest = resolve(__dirname, "../proxy-dist");

rmSync(dest, { recursive: true, force: true });

cpSync(resolve(proxyRoot, "dist"), resolve(dest, "dist"), { recursive: true });
cpSync(resolve(proxyRoot, "node_modules"), resolve(dest, "node_modules"), { recursive: true });
cpSync(resolve(proxyRoot, "package.json"), resolve(dest, "package.json"));

console.log("Copied proxy into extension/proxy-dist/");
// Note: no native-module rebuild step. SQLite is provided by node:sqlite,
// built into Electron's bundled Node runtime, so the same .vsix works on
// every platform.
