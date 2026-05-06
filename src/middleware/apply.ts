import { parseAnthropicRequest } from "../classifier/index.js";
import type { Pipeline } from "./pipeline.js";

interface ApplyParams {
  requestId: string;
  apiPath: string;
  headers: Record<string, string>;
  rawBody: string;
  inbound: Pipeline;
  outbound: Pipeline;
}

export async function applyPipelines(params: ApplyParams): Promise<string> {
  const { rawBody, inbound, outbound } = params;

  if (!rawBody) {
    return rawBody;
  }
  if (inbound.size() === 0 && outbound.size() === 0) {
    return rawBody;
  }

  let body;
  try {
    body = parseAnthropicRequest(rawBody);
  } catch {
    return rawBody;
  }

  const initial = {
    requestId: params.requestId,
    apiPath: params.apiPath,
    headers: params.headers,
    body,
  };
  const afterInbound = await inbound.run(initial);
  const afterOutbound = await outbound.run(afterInbound);
  return JSON.stringify(afterOutbound.body);
}
