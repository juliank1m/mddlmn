import { afterEach, describe, expect, test, vi } from "vitest";
import { forward } from "./forwarder.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function stubFetch(): ReturnType<typeof vi.spyOn> {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("ok", { status: 200 }));
}

function lastCallInit(spy: ReturnType<typeof vi.spyOn>): RequestInit {
  const call = spy.mock.calls.at(-1)!;
  return call[1] as RequestInit;
}

describe("forward", () => {
  test("targets api.anthropic.com with the given path", async () => {
    const fetchSpy = stubFetch();
    await forward("/v1/messages", "POST", {}, "{}");
    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
  });

  test("forwards through method, body, and non-stripped headers", async () => {
    const fetchSpy = stubFetch();
    await forward(
      "/v1/messages",
      "POST",
      { "x-api-key": "secret", "anthropic-version": "2023-06-01" },
      '{"x":1}'
    );
    const init = lastCallInit(fetchSpy);
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"x":1}');
    expect(init.headers).toMatchObject({
      "x-api-key": "secret",
      "anthropic-version": "2023-06-01",
    });
  });

  test("strips hop-by-hop and body-framing headers", async () => {
    const fetchSpy = stubFetch();
    await forward(
      "/v1/messages",
      "POST",
      {
        host: "localhost:8080",
        "content-length": "100",
        connection: "keep-alive",
        "keep-alive": "timeout=5",
        "transfer-encoding": "chunked",
        "accept-encoding": "gzip",
        "x-api-key": "keep",
      },
      "{}"
    );
    const headers = lastCallInit(fetchSpy).headers as Record<string, string>;
    expect(headers).not.toHaveProperty("host");
    expect(headers).not.toHaveProperty("content-length");
    expect(headers).not.toHaveProperty("connection");
    expect(headers).not.toHaveProperty("keep-alive");
    expect(headers).not.toHaveProperty("transfer-encoding");
    expect(headers).not.toHaveProperty("accept-encoding");
    expect(headers["x-api-key"]).toBe("keep");
  });

  test("strips headers case-insensitively", async () => {
    const fetchSpy = stubFetch();
    await forward("/v1/messages", "POST", { Host: "x", "Content-Length": "1" }, "{}");
    const headers = lastCallInit(fetchSpy).headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Host");
    expect(headers).not.toHaveProperty("Content-Length");
  });

  test("omits body for GET requests (fetch rejects body on GET)", async () => {
    const fetchSpy = stubFetch();
    await forward("/v1/models", "GET", {}, "");
    expect(lastCallInit(fetchSpy).body).toBeUndefined();
  });

  test("omits body for HEAD requests", async () => {
    const fetchSpy = stubFetch();
    await forward("/v1/models", "HEAD", {}, "");
    expect(lastCallInit(fetchSpy).body).toBeUndefined();
  });

  test("omits body when body string is empty even for POST", async () => {
    const fetchSpy = stubFetch();
    await forward("/v1/messages", "POST", {}, "");
    expect(lastCallInit(fetchSpy).body).toBeUndefined();
  });
});
