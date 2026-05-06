import type { AnthropicRequest } from "../classifier/index.js";

export interface MiddlewareContext {
  requestId: string;
  apiPath: string;
  headers: Record<string, string>;
  body: AnthropicRequest;
}

export type MiddlewareFunction = (
  ctx: MiddlewareContext
) => Promise<MiddlewareContext> | MiddlewareContext;

export class Pipeline {
  private fns: MiddlewareFunction[] = [];

  use(fn: MiddlewareFunction): void {
    this.fns.push(fn);
  }

  async run(ctx: MiddlewareContext): Promise<MiddlewareContext> {
    let current = ctx;
    for (const fn of this.fns) {
      current = await fn(current);
    }
    return current;
  }

  size(): number {
    return this.fns.length;
  }
}
