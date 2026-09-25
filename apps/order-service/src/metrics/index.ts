import { Counter, Histogram, registry } from "@stockrush/shared";

export const ordersCreatedCounter = new Counter({
  name: "order_service_orders_created_total",
  help: "Total orders created",
  labelNames: ["status"],
  registers: [registry],
});

export const orderCreationDuration = new Histogram({
  name: "order_service_order_creation_duration_seconds",
  help: "Order creation duration in seconds",
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});

export const grpcCallDuration = new Histogram({
  name: "order_service_grpc_duration_seconds",
  help: "gRPC call duration to product-service",
  labelNames: ["method", "success"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1],
  registers: [registry],
});
