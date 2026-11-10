# Browser RUM — Frontend Observability (Web)

Instrument the browser/SPA with OpenTelemetry RUM: Web Vitals, page-load tracing, route changes, and JavaScript error capture. Correlates frontend issues to backend traces.

> **BẮT BUỘC:** Áp dụng khi setup frontend observability, Web Vitals, RUM, hoặc JS error tracking.

## When to Use

- Adding browser telemetry to a React SPA
- Tracking Web Vitals (LCP, INP, CLS) and page-load performance
- Capturing client-side JS errors
- Correlating frontend → backend traces

## Essential Principles

1. **Privacy-sensitive**: browser telemetry captures URLs, console, DOM. Sanitize URLs; NEVER capture form values/PII/credentials.
2. **Volume-sensitive**: browser is noisy — use a bounded signal set + sampling. Don't capture everything.
3. **Pin versions**: browser OTel packages are experimental (0.x) and move fast — verify current releases and pin exact versions.
4. **No secrets in bundle**: browser bundles must not contain backend credentials or internal tokens.
5. **Use `EXPO_PUBLIC_`/`NEXT_PUBLIC_` only for non-secret public values** — never API keys, internal service URLs with credentials.

## Packages

```bash
npm view @opentelemetry/sdk-trace-web version
npm view @opentelemetry/context-zone version
npm view @opentelemetry/instrumentation-document-load version
```

## Setup Sketch (React)

- Initialize `WebTracerProvider` + `OTLPTraceExporter` at app entry.
- Instrument document-load, route changes (history), and errors.
- Capture Web Vitals via `web-vitals` package, report as metrics.
- Attach `traceparent` header to fetch calls for backend correlation.

## Checklist (review gate)

- [ ] Web Vitals (LCP/INP/CLS) captured
- [ ] JS errors captured (uncaught + unhandledrejection)
- [ ] Route changes traced
- [ ] Frontend→backend trace correlation (traceparent header)
- [ ] URLs sanitized, no PII/form values captured
- [ ] No backend credentials in client bundle

## Output

RUM instrumentation + checklist. **Any PII capture or secret-in-bundle blocks PASS.**

## Tone

Be specific — "fetch sends full query string with user email into span attribute at lib/api.ts:22" not "privacy issue".
