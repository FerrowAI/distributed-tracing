import { generateSpanId, generateTraceId } from "./ids";
import { extractTraceparent, injectTraceparent, TraceContext } from "./traceparent";
import type { Exporter } from "./exporters";

export { generateTraceId, generateSpanId } from "./ids";
export { injectTraceparent, extractTraceparent } from "./traceparent";
export type { TraceContext } from "./traceparent";
export { ConsoleExporter, InMemoryExporter } from "./exporters";
export type { Exporter } from "./exporters";

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface SpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  tags: Record<string, unknown>;
  events: SpanEvent[];
}

export interface TracerOptions {
  exporter: Exporter;
}

/** A single unit of work within a trace. Created via `Tracer.startSpan`/`Span.startChild`. */
export class Span {
  private data: SpanData;
  private tracer: Tracer;
  private ended = false;

  constructor(tracer: Tracer, traceId: string, spanId: string, parentSpanId: string | undefined, name: string) {
    this.tracer = tracer;
    this.data = {
      traceId,
      spanId,
      parentSpanId,
      name,
      startTime: nowMs(),
      tags: {},
      events: [],
    };
  }

  get traceId(): string {
    return this.data.traceId;
  }

  get spanId(): string {
    return this.data.spanId;
  }

  /** Attach a tag (key/value metadata) to the span. */
  setTag(key: string, value: unknown): this {
    this.data.tags[key] = value;
    return this;
  }

  /** Record a point-in-time event within the span's lifetime. */
  addEvent(name: string, attributes?: Record<string, unknown>): this {
    this.data.events.push({ name, timestamp: nowMs(), attributes });
    return this;
  }

  /** Start a child span sharing this span's traceId, parented to this span. */
  startChild(name: string): Span {
    return new Span(this.tracer, this.data.traceId, generateSpanId(), this.data.spanId, name);
  }

  /** The W3C traceparent header value to send to a downstream service, continuing this span's trace. */
  toTraceparent(): string {
    return injectTraceparent({ traceId: this.data.traceId, spanId: this.data.spanId, sampled: true });
  }

  /** Finish the span, record its duration, and export it. Idempotent. */
  end(): SpanData {
    if (!this.ended) {
      this.ended = true;
      this.data.endTime = nowMs();
      this.data.durationMs = this.data.endTime - this.data.startTime;
      void this.tracer.export(this.data);
    }
    return this.toJSON();
  }

  toJSON(): SpanData {
    return { ...this.data, tags: { ...this.data.tags }, events: [...this.data.events] };
  }
}

function nowMs(): number {
  // Fall back to Date.now() if the high-resolution timer isn't available (e.g. some non-Node runtimes).
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/** Creates and exports spans. One Tracer per service/process is typical. */
export class Tracer {
  private exporter: Exporter;

  constructor(options: TracerOptions) {
    this.exporter = options.exporter;
  }

  /** Start a new root span (new trace) or, if `parentContext` is given, a span continuing an existing trace. */
  startSpan(name: string, parentContext?: TraceContext): Span {
    if (parentContext) {
      return new Span(this, parentContext.traceId, generateSpanId(), parentContext.spanId, name);
    }
    return new Span(this, generateTraceId(), generateSpanId(), undefined, name);
  }

  /** Start a span continuing whatever trace is described by an incoming W3C `traceparent` header. */
  startSpanFromHeader(name: string, traceparentHeader: string | undefined | null): Span {
    const parentContext = extractTraceparent(traceparentHeader);
    return this.startSpan(name, parentContext);
  }

  /** @internal called by Span.end() */
  async export(span: SpanData): Promise<void> {
    await this.exporter.export(span);
  }
}

/**
 * Assemble a flat list of exported spans (e.g. from InMemoryExporter) into
 * a tree, rooted at spans with no parentSpanId (or a parent not present in
 * the list — e.g. it crossed a service boundary you didn't capture).
 */
export interface SpanTreeNode {
  span: SpanData;
  children: SpanTreeNode[];
}

export function buildTraceTree(spans: SpanData[]): SpanTreeNode[] {
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const nodes = new Map<string, SpanTreeNode>();
  for (const span of spans) nodes.set(span.spanId, { span, children: [] });

  const roots: SpanTreeNode[] = [];
  for (const span of spans) {
    const node = nodes.get(span.spanId)!;
    if (span.parentSpanId && byId.has(span.parentSpanId)) {
      nodes.get(span.parentSpanId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export default Tracer;
