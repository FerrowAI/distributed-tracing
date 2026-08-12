const { Tracer, InMemoryExporter, buildTraceTree } = require("../dist/index.js");

function printTree(nodes, depth = 0) {
  for (const node of nodes) {
    const indent = "  ".repeat(depth);
    console.log(
      `${indent}- ${node.span.name} (span=${node.span.spanId} duration=${node.span.durationMs.toFixed(2)}ms tags=${JSON.stringify(
        node.span.tags
      )})`
    );
    printTree(node.children, depth + 1);
  }
}

async function main() {
  const exporter = new InMemoryExporter();

  // --- "service A": handles the incoming request, starts the trace ---
  const tracerA = new Tracer({ exporter });
  const rootSpan = tracerA.startSpan("http.request POST /checkout");
  rootSpan.setTag("http.method", "POST").setTag("http.route", "/checkout");
  rootSpan.addEvent("request.received");

  const dbSpan = rootSpan.startChild("db.query orders.insert");
  dbSpan.setTag("db.system", "postgres");
  await new Promise((r) => setTimeout(r, 10));
  dbSpan.end();

  // Service A calls Service B over HTTP — inject the W3C header to propagate the trace.
  const outboundSpan = rootSpan.startChild("http.client POST inventory-service");
  const traceparentHeader = outboundSpan.toTraceparent();
  console.log(`Outbound request carries header: traceparent: ${traceparentHeader}`);

  // --- "service B": a different process entirely, only has the header ---
  const tracerB = new Tracer({ exporter });
  const serverSpan = tracerB.startSpanFromHeader("http.request POST /reserve", traceparentHeader);
  serverSpan.setTag("service", "inventory-service");
  serverSpan.addEvent("reserved", { sku: "WIDGET-1", qty: 2 });
  await new Promise((r) => setTimeout(r, 5));
  serverSpan.end();

  outboundSpan.end();
  rootSpan.end();

  console.log(`\nSame traceId across both services: ${rootSpan.traceId === serverSpan.traceId}`);

  const spans = exporter.getSpansForTrace(rootSpan.traceId);
  console.log(`\nCollected ${spans.length} spans for trace ${rootSpan.traceId}. Assembled tree:\n`);
  const tree = buildTraceTree(spans);
  printTree(tree);
}

main();
