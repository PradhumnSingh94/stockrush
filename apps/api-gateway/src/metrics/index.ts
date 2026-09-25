import { Counter, Histogram, registry } from "@stockrush/shared";

export const httpRequestCounter = new Counter({
  name: "api_gateway_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: "api_gateway_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});

export const rateLimitCounter = new Counter({
  name: "api_gateway_rate_limit_hits_total",
  help: "Total rate limit hits",
  labelNames: ["endpoint"],
  registers: [registry],
});
