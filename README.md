# distributed-tracing

A small distributed tracer: spans with `traceId`/`spanId`/`parentSpanId`,
spec-correct W3C `traceparent` header inject/extract, child spans, tags,
timestamped events, duration, and a pluggable exporter interface — zero
runtime dependencies.

This is not a full OpenTelemetry SDK — no automatic instrumentation, no
context propagation via async hooks, no OTLP wire format. It's the
minimal, correct core (span model + W3C header handling) you can wire
into whatever HTTP client/server you're already using.

## Install

```bash
npm install distributed-tracing
```

## Quickstart

```ts
import { Tracer, ConsoleExporter } from "distributed-tracing";

const tracer = new Tracer({ exporter: new ConsoleExporter() });

const span = tracer.startSpan("http.request GET /users");
span.setTag("http.route", "/users");

const dbSpan = span.startChild("db.query users.select");
// ... do the query ...
dbSpan.end();

// Propagate to a downstream call:
const header = span.toTraceparent();
await fetch("https://downstream/api", { headers: { traceparent: header } });

span.end(); // exports via the configured Exporter
```

On the receiving service:

```ts
const serverSpan = tracer.startSpanFromHeader(
  "http.request POST /api",
  req.headers["traceparent"]
);
// same traceId as the caller, parented to its span
```

## API

### `new Tracer({ exporter })`

- `startSpan(name: string, parentContext?: TraceContext): Span` — starts a new trace if no parent, otherwise continues one.
- `startSpanFromHeader(name: string, traceparentHeader: string | null | undefined): Span` — parses the header and continues that trace, or starts a fresh one if the header is missing/malformed.

### `Span`

- `setTag(key, value): this`
- `addEvent(name, attributes?): this`
- `startChild(name): Span` — shares `traceId`, parented to this span.
- `toTraceparent(): string` — the W3C header value to send downstream.
- `end(): SpanData` — finalizes duration and exports. Idempotent.
- `.traceId` / `.spanId`

### W3C `traceparent` header

- `injectTraceparent(ctx: TraceContext): string` — formats `00-<32 hex traceId>-<16 hex spanId>-<flags>` per the [W3C Trace Context spec](https://www.w3.org/TR/trace-context/#traceparent-header).
- `extractTraceparent(header): TraceContext | undefined` — parses and validates; returns `undefined` for anything that doesn't match spec (wrong lengths, all-zero ids, version `ff`), so a malformed header degrades to "start a new trace" instead of crashing.

### Exporters

```ts
interface Exporter {
  export(span: SpanData): void | Promise<void>;
}
```

- `ConsoleExporter` — one log line per finished span.
- `InMemoryExporter` — collects spans; `.getSpans()`, `.getSpansForTrace(traceId)`, `.clear()`.

### `buildTraceTree(spans: SpanData[]): SpanTreeNode[]`

Assembles a flat span list (e.g. from `InMemoryExporter`) into a
parent/children tree, rooted at spans whose parent is absent or wasn't
captured (crossed a boundary you didn't collect).

## Design notes

The `traceparent` implementation follows the W3C spec's exact grammar
(`version-traceid-parentid-flags`, all lowercase hex, fixed widths) and
rejects the spec's explicit invalid cases (all-zero ids, version `ff`)
rather than trying to be lenient — a tracer that silently accepts
malformed context can stitch unrelated requests into the same trace,
which is worse than starting a fresh one. The exporter is an interface,
not a bundled HTTP/OTLP client, because where spans go (stdout, a
collector, a test assertion) is a deployment decision this library
shouldn't make for you.

---

Sponsored by [Ferrow](https://ferrow.ai)
