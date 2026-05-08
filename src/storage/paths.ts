import os from "node:os";
import path from "node:path";

export function configDir(): string {
  return process.env.MDDLMN_CONFIG_DIR ?? path.join(os.homedir(), ".mddlmn");
}

export function configFile(name: string): string {
  return path.join(configDir(), name);
}
