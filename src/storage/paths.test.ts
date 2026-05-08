import { describe, expect, test } from "vitest";
import os from "node:os";
import path from "node:path";
import { configDir, configFile } from "./paths.js";

describe("paths", () => {
  test("configDir respects MDDLMN_CONFIG_DIR override", () => {
    const original = process.env.MDDLMN_CONFIG_DIR;
    process.env.MDDLMN_CONFIG_DIR = "/tmp/mddlmn-test-override";
    try {
      expect(configDir()).toBe("/tmp/mddlmn-test-override");
    } finally {
      if (original === undefined) delete process.env.MDDLMN_CONFIG_DIR;
      else process.env.MDDLMN_CONFIG_DIR = original;
    }
  });

  test("configDir defaults to ~/.mddlmn", () => {
    const original = process.env.MDDLMN_CONFIG_DIR;
    delete process.env.MDDLMN_CONFIG_DIR;
    try {
      expect(configDir()).toBe(path.join(os.homedir(), ".mddlmn"));
    } finally {
      if (original !== undefined) process.env.MDDLMN_CONFIG_DIR = original;
    }
  });

  test("configFile joins relative to configDir", () => {
    const original = process.env.MDDLMN_CONFIG_DIR;
    process.env.MDDLMN_CONFIG_DIR = "/tmp/mddlmn-test-override";
    try {
      expect(configFile("redaction-rules.json")).toBe(
        "/tmp/mddlmn-test-override/redaction-rules.json"
      );
    } finally {
      if (original === undefined) delete process.env.MDDLMN_CONFIG_DIR;
      else process.env.MDDLMN_CONFIG_DIR = original;
    }
  });
});
