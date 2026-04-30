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

  app.get<{ Params: SessionStatsParams }>("/api/stats/tokens/:sessionId", async (request, reply) => {
    const session = getSession(request.params.sessionId);
    if (!session) {
      return notFound(reply, "Session not found");
    }

    return { session, points: getTokenStats(request.params.sessionId) };
  });
}
