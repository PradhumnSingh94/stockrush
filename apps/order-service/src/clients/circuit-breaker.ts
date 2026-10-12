import * as grpc from "@grpc/grpc-js";
import CircuitBreaker from "opossum";
import { productClient } from "./product.grpc.client";

const options = {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
};

export const decrementBreaker = new CircuitBreaker(
  productClient.decrement,
  options,
);
export const getProductBreaker = new CircuitBreaker(productClient.get, options);

decrementBreaker.on("open", () => {
  console.log("Circuit OPEN — product-service unreachable");
});
decrementBreaker.on("halfOpen", () => {
  console.log("Circuit HALF-OPEN — testing product-service");
});
decrementBreaker.on("close", () => {
  console.log("Circuit CLOSED — product-service recovered");
});
decrementBreaker.fallback(() => {
  throw new Error("Product service unavailable — circuit open");
});

const reservationOptions = {
  ...options,
  // Business rejections prove that the service is responding and must not
  // count as availability failures that open the breaker.
  errorFilter: (error: unknown) => {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: number }).code
        : undefined;
    return [
      grpc.status.FAILED_PRECONDITION,
      grpc.status.INVALID_ARGUMENT,
      grpc.status.ALREADY_EXISTS,
    ].includes(code as number);
  },
};

export const reserveStockBreaker = new CircuitBreaker(
  productClient.reserveStock,
  reservationOptions,
);

reserveStockBreaker.on("open", () => {
  console.error("Stock reservation circuit opened");
});
reserveStockBreaker.on("halfOpen", () => {
  console.log("Reserve Stock Breaker Circuit HALF-OPEN");
});
reserveStockBreaker.on("close", () => {
  console.log("Reserve Stock Breaker Circuit CLOSED");
});
