import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from "prom-client";

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export { Counter, Histogram, Gauge };
