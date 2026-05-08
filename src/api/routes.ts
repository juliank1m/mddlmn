import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  getRequest,
  getSession,
  getTokenStats,
  listRequestsForSession,
  listSectionsForRequest,
  listSessions,
  type SectionRecord,
} from "../storage/db.js";
import { readLogEntryAtOffset } from "../storage/logger.js";
import {
  approveHeld,
  cancelHeld,
  gate,
  setGateEnabled,
} from "../proxy/gate-singleton.js";
import {
  loadRedactionRules,
  saveRedactionRules,
  type RedactionRule,
} from "../middleware/redaction.js";
import type { AnthropicRequest } from "../classifier/index.js";

type IdParams = {
  id: string;
};

type DiffParams = {
  idA: string;
  idB: string;
};

type SessionStatsParams = {
  sessionId: string;
};

type DiffEntry =
  | {
      status: "unchanged";
      key: string;
      section: SectionRecord;
    }
  | {
      status: "modified";
      key: string;
      before: SectionRecord;
      after: SectionRecord;
    }
  | {
      status: "removed";
      key: string;
      section: SectionRecord;
    }
  | {
      status: "added";
      key: string;
      section: SectionRecord;
    };

function notFound(reply: FastifyReply, message: string): FastifyReply {
  return reply.status(404).send({ error: message });
}

function sectionKeys(sections: SectionRecord[]): Map<string, SectionRecord> {
  const counts = new Map<string, number>();
  const keyed = new Map<string, SectionRecord>();

  for (const section of sections) {
    const baseKey = `${section.type}:${section.label ?? ""}`;
    const count = counts.get(baseKey) ?? 0;
    counts.set(baseKey, count + 1);
    keyed.set(`${baseKey}:${count}`, section);
  }

  return keyed;
}

function diffSections(before: SectionRecord[], after: SectionRecord[]): DiffEntry[] {
  const beforeByKey = sectionKeys(before);
  const afterByKey = sectionKeys(after);
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
  const diff: DiffEntry[] = [];

  for (const key of keys) {
    const beforeSection = beforeByKey.get(key);
    const afterSection = afterByKey.get(key);

    if (beforeSection && !afterSection) {
      diff.push({ status: "removed", key, section: beforeSection });
      continue;
    }

    if (!beforeSection && afterSection) {
      diff.push({ status: "added", key, section: afterSection });
      continue;
    }

    if (!beforeSection || !afterSection) {
      continue;
    }

    if (beforeSection.contentHash === afterSection.contentHash) {
      diff.push({ status: "unchanged", key, section: afterSection });
      continue;
    }

    diff.push({
      status: "modified",
      key,
      before: beforeSection,
      after: afterSection,
    });
  }

  return diff;
}

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/sessions", async () => {
    return { sessions: listSessions() };
  });

  app.get<{ Params: IdParams }>("/api/sessions/:id", async (request, reply) => {
    const session = getSession(request.params.id);
    if (!session) {
      return notFound(reply, "Session not found");
    }

    return { session };
  });

  app.get<{ Params: IdParams }>("/api/sessions/:id/requests", async (request, reply) => {
    const session = getSession(request.params.id);
    if (!session) {
      return notFound(reply, "Session not found");
    }

    return { requests: listRequestsForSession(request.params.id) };
  });

  app.get<{ Params: IdParams }>("/api/requests/:id", async (request, reply) => {
    const storedRequest = getRequest(request.params.id);
    if (!storedRequest) {
      return notFound(reply, "Request not found");
    }

    return {
      request: storedRequest,
      sections: listSectionsForRequest(storedRequest.id),
    };
  });

  app.get<{ Params: IdParams }>("/api/requests/:id/raw", async (request, reply) => {
    const storedRequest = getRequest(request.params.id);
    if (!storedRequest) {
      return notFound(reply, "Request not found");
    }

    const session = getSession(storedRequest.sessionId);
    if (!session?.logFile) {
      return notFound(reply, "Raw log file not found");
    }

    const logEntry = await readLogEntryAtOffset(session.logFile, storedRequest.rawLogOffset);
    if (!logEntry) {
      return notFound(reply, "Raw log entry not found");
    }

    return { raw: logEntry };
  });

  app.get<{ Params: IdParams }>("/api/requests/:id/sections", async (request, reply) => {
    const storedRequest = getRequest(request.params.id);
    if (!storedRequest) {
      return notFound(reply, "Request not found");
    }

    return { sections: listSectionsForRequest(storedRequest.id) };
  });

  app.get<{ Params: DiffParams }>("/api/diff/:idA/:idB", async (request, reply) => {
    const requestA = getRequest(request.params.idA);
    const requestB = getRequest(request.params.idB);

    if (!requestA) {
      return notFound(reply, "First request not found");
    }

    if (!requestB) {
      return notFound(reply, "Second request not found");
    }

    const sectionsA = listSectionsForRequest(requestA.id);
    const sectionsB = listSectionsForRequest(requestB.id);

    return {
      before: requestA,
      after: requestB,
      diff: diffSections(sectionsA, sectionsB),
    };
  });

  app.get("/api/gate/status", async () => {
    return {
      enabled: gate.isEnabled(),
      queueLength: gate.queueLength(),
      currentHeldId: gate.currentHeldId(),
    };
  });

  app.post("/api/gate/enable", async () => {
    setGateEnabled(true);
    return { enabled: true };
  });

  app.post("/api/gate/disable", async () => {
    setGateEnabled(false);
    return { enabled: false };
  });

  app.post<{ Params: { requestId: string } }>(
    "/api/gate/:requestId/approve",
    async (request) => {
      let editedBody: AnthropicRequest | undefined;
      const raw = request.body;
      if (typeof raw === "string" && raw.length > 0) {
        try {
          const parsed = JSON.parse(raw) as { body?: AnthropicRequest };
          editedBody = parsed.body;
        } catch {
          // ignore — approve as-is
        }
      } else if (raw && typeof raw === "object") {
        editedBody = (raw as { body?: AnthropicRequest }).body;
      }
      approveHeld(request.params.requestId, editedBody);
      return { ok: true };
    }
  );

  app.post<{ Params: { requestId: string } }>(
    "/api/gate/:requestId/cancel",
    async (request) => {
      cancelHeld(request.params.requestId);
      return { ok: true };
    }
  );

  app.get<{ Params: SessionStatsParams }>("/api/stats/tokens/:sessionId", async (request, reply) => {
    const session = getSession(request.params.sessionId);
    if (!session) {
      return notFound(reply, "Session not found");
    }

    return { session, points: getTokenStats(request.params.sessionId) };
  });

  app.get("/api/redaction/rules", async () => {
    return { rules: loadRedactionRules() };
  });

  app.post("/api/redaction/rules", async (request, reply) => {
    const parsed = parseJsonBody(request.body);
    if (!parsed || typeof parsed !== "object") {
      return badRequest(reply, "Invalid rule body");
    }

    const draft = parsed as Partial<RedactionRule>;
    if (typeof draft.name !== "string" || typeof draft.pattern !== "string") {
      return badRequest(reply, "Rule requires name and pattern");
    }

    const rules = loadRedactionRules();
    const id = typeof draft.id === "string" && draft.id.length > 0
      ? draft.id
      : `custom:${randomUUID()}`;
    if (rules.some((r) => r.id === id)) {
      return badRequest(reply, "Rule with this id already exists");
    }

    const rule: RedactionRule = {
      id,
      name: draft.name,
      pattern: draft.pattern,
      flags: typeof draft.flags === "string" ? draft.flags : "g",
      replacement:
        typeof draft.replacement === "string" ? draft.replacement : "[REDACTED]",
      enabled: draft.enabled !== false,
      builtin: false,
    };

    rules.push(rule);
    saveRedactionRules(rules);
    return { rule };
  });

  app.patch<{ Params: IdParams }>(
    "/api/redaction/rules/:id",
    async (request, reply) => {
      const parsed = parseJsonBody(request.body);
      if (!parsed || typeof parsed !== "object") {
        return badRequest(reply, "Invalid update body");
      }
      const updates = parsed as Partial<RedactionRule>;

      const rules = loadRedactionRules();
      const idx = rules.findIndex((r) => r.id === request.params.id);
      if (idx === -1) {
        return notFound(reply, "Rule not found");
      }

      const current = rules[idx];
      const next: RedactionRule = {
        ...current,
        // builtins can be toggled and replacement-tweaked, but pattern stays.
        name: typeof updates.name === "string" ? updates.name : current.name,
        pattern: current.builtin
          ? current.pattern
          : typeof updates.pattern === "string"
            ? updates.pattern
            : current.pattern,
        flags: current.builtin
          ? current.flags
          : typeof updates.flags === "string"
            ? updates.flags
            : current.flags,
        replacement:
          typeof updates.replacement === "string"
            ? updates.replacement
            : current.replacement,
        enabled:
          typeof updates.enabled === "boolean"
            ? updates.enabled
            : current.enabled,
        // id and builtin flag can never change
        id: current.id,
        builtin: current.builtin,
      };

      rules[idx] = next;
      saveRedactionRules(rules);
      return { rule: next };
    }
  );

  app.delete<{ Params: IdParams }>(
    "/api/redaction/rules/:id",
    async (request, reply) => {
      const rules = loadRedactionRules();
      const idx = rules.findIndex((r) => r.id === request.params.id);
      if (idx === -1) {
        return notFound(reply, "Rule not found");
      }
      if (rules[idx].builtin) {
        return badRequest(reply, "Cannot delete a built-in rule");
      }
      rules.splice(idx, 1);
      saveRedactionRules(rules);
      return { ok: true };
    }
  );
}

function parseJsonBody(body: unknown): unknown {
  if (typeof body === "string") {
    if (body.length === 0) return null;
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body;
}

function badRequest(reply: FastifyReply, message: string): FastifyReply {
  return reply.status(400).send({ error: message });
}
