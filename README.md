# Distributed Tracing

Trace requests across services. Debug distributed system issues.

```javascript
const tracer = new DistributedTracer();
const span = tracer.startSpan('api-call');
span.addTag('userId', 123);
span.finish();
```

Solves: Observability, debugging slow requests, performance bottlenecks.
License: MIT
