import type { SpanData } from "./index";

/** Pluggable sink for finished spans. */
export interface Exporter {
  export(span: SpanData): void | Promise<void>;
}

/** Logs each finished span to the console as one line. */
export class ConsoleExporter implements Exporter {
  export(span: SpanData): void {
    // eslint-disable-next-line no-console
    console.log(
      `[trace ${span.traceId}] ${span.name} span=${span.spanId} parent=${span.parentSpanId ?? "-"} ` +
        `duration=${span.durationMs?.toFixed(2)}ms`
    );
  }
}

/** Collects finished spans in memory. Useful for tests and for assembling trace trees. */
export class InMemoryExporter implements Exporter {
  private spans: SpanData[] = [];

  export(span: SpanData): void {
    this.spans.push(span);
  }

  getSpans(): SpanData[] {
    return [...this.spans];
  }

  getSpansForTrace(traceId: string): SpanData[] {
    return this.spans.filter((s) => s.traceId === traceId);
  }

  clear(): void {
    this.spans = [];
  }
}
