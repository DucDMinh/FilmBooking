# OpenTelemetry Instrumentation (Web)

Configures trace spans, custom metrics, log exporters, and sampling for OpenTelemetry in **Node.js/Next.js backend** and **browser (RUM)**. Use when instrumenting the app with traces, metrics, or logs.

> **BẮT BUỘC:** Áp dụng khi setup/implement observability, telemetry, tracing, metrics, hoặc logging integration.

## When to Use

- Setting up OTel SDK (backend Node.js)
- Adding browser RUM (Web Vitals, page-load, JS errors)
- Configuring exporters (OTLP) and sampling
- Reviewing telemetry quality before deploy

## Essential Principles

1. **Signals**: traces (requests), metrics (counters/histograms), logs (structured). Correlate via `trace_id`.
2. **Never write package names/versions from memory** — verify against npm registry first (`npm view <pkg> version`).
3. **Installing SDK is not enough** — must initialize the SDK AND enable exporters.
4. **Sensitive data**: NEVER capture form values, PII, passwords, tokens, or full URLs in attributes. Sanitize/redact.
5. **Cardinality control**: avoid high-cardinality attributes (user IDs, raw URLs) in metric dimensions.

## Commands

```bash
# Backend (Node.js) — verify packages exist
npm view @opentelemetry/sdk-node version
npm view @opentelemetry/auto-instrumentations-node version
npm view @opentelemetry/exporter-trace-otlp-http version

# Browser (RUM)
npm view @opentelemetry/sdk-trace-web version
npm view @opentelemetry/context-zone version
```

## Backend Setup (Node.js/Next.js API)

```ts
// instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'my-app',
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```

## Browser (RUM) Setup

- Instrument page-load, route changes, and JS errors.
- Use `@opentelemetry/sdk-trace-web` + `@opentelemetry/context-zone`.
- Pin exact compatible versions (browser OTel moves fast).
- Sanitize URLs; never capture form values or PII.

## Validation (pre-deploy)

- Traces flowing to collector (verify exporter endpoint reachable)
- Service name + environment set on resources
- No PII/sensitive data in attributes
- Sampling tuned (not sampling 100% of everything in prod)

## Output

Instrumentation done + verification checklist. **Any sensitive-data exposure (PII/token in attributes) blocks PASS.**

## Tone

Be specific — "OTLP exporter endpoint missing so no traces will ship" not "telemetry incomplete".
