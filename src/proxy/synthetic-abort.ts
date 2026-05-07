interface BuildSyntheticAbortParams {
  requestId: string;
  model: string;
  stream: boolean;
}

interface SyntheticAbortResponse {
  contentType: string;
  body: string;
}

const ABORT_TEXT = "[cancelled by mddlmn]";

function makeMessageId(requestId: string): string {
  return `msg_mddlmn_${requestId.slice(0, 8)}`;
}

function buildJsonAbort(params: BuildSyntheticAbortParams): string {
  return JSON.stringify({
    id: makeMessageId(params.requestId),
    type: "message",
    role: "assistant",
    model: params.model,
    content: [{ type: "text", text: ABORT_TEXT }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  });
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function buildSseAbort(params: BuildSyntheticAbortParams): string {
  const messageId = makeMessageId(params.requestId);

  return (
    sseEvent("message_start", {
      type: "message_start",
      message: {
        id: messageId,
        type: "message",
        role: "assistant",
        model: params.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }) +
    sseEvent("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }) +
    sseEvent("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: ABORT_TEXT },
    }) +
    sseEvent("content_block_stop", {
      type: "content_block_stop",
      index: 0,
    }) +
    sseEvent("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 0 },
    }) +
    sseEvent("message_stop", { type: "message_stop" })
  );
}

export function buildSyntheticAbort(
  params: BuildSyntheticAbortParams
): SyntheticAbortResponse {
  if (params.stream) {
    return {
      contentType: "text/event-stream",
      body: buildSseAbort(params),
    };
  }
  return {
    contentType: "application/json",
    body: buildJsonAbort(params),
  };
}
