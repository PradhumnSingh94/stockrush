import { Counter, Histogram, Gauge, registry } from "@stockrush/shared";

export const stockDecrementCounter = new Counter({
  name: "product_service_stock_decrements_total",
  help: "Total stock decrements",
  labelNames: ["success"],
  registers: [registry],
});

export const cacheHitCounter = new Counter({
  name: "product_service_cache_hits_total",
  help: "Total cache hits",
  labelNames: ["operation"],
  registers: [registry],
});

export const cacheMissCounter = new Counter({
  name: "product_service_cache_misses_total",
  help: "Total cache misses",
  labelNames: ["operation"],
  registers: [registry],
});

export const stockLevelGauge = new Gauge({
  name: "product_service_stock_level",
  help: "Current stock level per product",
  labelNames: ["product_name"],
  registers: [registry],
});
