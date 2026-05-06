import { parseAnthropicRequest } from "../classifier/index.js";
import type { Pipeline } from "./pipeline.js";

interface RunStageParams {
  requestId: string;
  apiPath: string;
  headers: Record<string, string>;
  rawBody: string;
  pipeline: Pipeline;
}

export async function runStage(params: RunStageParams): Promise<string> {
  const { rawBody, pipeline } = params;
  if (!rawBody || pipeline.size() === 0) return rawBody;

  let body;
  try {
    body = parseAnthropicRequest(rawBody);
  } catch {
    return rawBody;
  }

  const result = await pipeline.run({
    requestId: params.requestId,
    apiPath: params.apiPath,
    headers: params.headers,
    body,
  });
  return JSON.stringify(result.body);
}
