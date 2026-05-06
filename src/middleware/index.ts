import { Pipeline } from "./pipeline.js";

export const inboundPipeline = new Pipeline();
export const outboundPipeline = new Pipeline();

export type { MiddlewareContext, MiddlewareFunction } from "./pipeline.js";
export { Pipeline } from "./pipeline.js";
export { applyPipelines } from "./apply.js";
export { runStage } from "./run-stage.js";
