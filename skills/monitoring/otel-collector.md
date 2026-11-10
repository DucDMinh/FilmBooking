# OpenTelemetry Collector Config

Author, review, and debug **OpenTelemetry Collector** component configuration — receivers, processors, exporters, connectors, extensions, pipeline wiring.

> **BẮT BUỘC:** Áp dụng khi setup/configure/sửa Collector YAML cho production monitoring.

## When to Use

- Writing/editing Collector `otelcol-config.yaml`
- Choosing receivers/processors/exporters for a signal
- Debugging why telemetry isn't arriving
- Optimizing sampling / batching for cost

## Essential Principles

1. **Pipeline wiring**: receivers → processors → exporters, per signal (traces/metrics/logs).
2. **Always add a batch processor** — it bounds memory and network cost. Never export per-span.
3. **Add a memory limiter processor** — prevents OOM under load.
4. **Sanitize logs** — redact PII/secrets via a processing step before export.
5. **Verify component availability** — some components are in `-contrib` build, not core.

## Example (minimal OTLP pipeline)

```yaml
receivers:
  otlp:
    protocols:
      grpc:
      http:

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_mib: 500

exporters:
  otlphttp/monitor:
    endpoint: ${env:OTEL_EXPORTER_OTLP_ENDPOINT}
    headers:
      Authorization: "Bearer ${env:OTEL_EXPORTER_OTLP_TOKEN}"

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/monitor]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/monitor]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/monitor]
```

## Checklist

- [ ] Batch processor present (no per-span export)
- [ ] Memory limiter present
- [ ] `OTEL_EXPORTER_OTLP_ENDPOINT` + auth token from env (not hardcoded)
- [ ] Log sanitization/redaction configured
- [ ] Sampling strategy defined (tail/head) for cost control
- [ ] No secrets in YAML

## Output

Config + verification. **Any hardcoded secret or missing batch/memory-limiter blocks PASS.**

## Tone

Be specific — "missing batch processor will send per-span, blowing memory/network" not "config not optimized".
