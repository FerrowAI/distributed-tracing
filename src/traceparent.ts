export interface TraceContext {
  traceId: string; // 32 hex chars
  spanId: string; // 16 hex chars
  /** W3C sampled flag. This library always injects "01" (sampled); extract preserves whatever was received. */
  sampled: boolean;
}

const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/**
 * Build a W3C `traceparent` header value: `00-<32 hex trace id>-<16 hex parent id>-<flags>`.
 * https://www.w3.org/TR/trace-context/#traceparent-header
 */
export function injectTraceparent(ctx: TraceContext): string {
  const flags = ctx.sampled ? "01" : "00";
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/**
 * Parse a W3C `traceparent` header value. Returns `undefined` if it doesn't
 * match the spec format (version 00, 32-hex trace id, 16-hex parent id,
 * 2-hex flags) — malformed headers should be treated as "no incoming trace".
 */
export function extractTraceparent(header: string | undefined | null): TraceContext | undefined {
  if (!header) return undefined;
  const match = TRACEPARENT_RE.exec(header.trim());
  if (!match) return undefined;
  const [, version, traceId, parentId, flags] = match;
  if (version === "ff") return undefined; // ff is explicitly invalid per spec
  if (traceId === "0".repeat(32) || parentId === "0".repeat(16)) return undefined;
  return {
    traceId,
    spanId: parentId,
    sampled: (parseInt(flags, 16) & 0x01) === 1,
  };
}
