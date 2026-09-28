import CircuitBreaker from "opossum";
import { productClient } from "./product.grpc.client";

const options = {
  timeout: 3000, // fail if takes longer than 3s
  errorThresholdPercentage: 50, // open after 50% failures
  resetTimeout: 30000, // try again after 30s
  volumeThreshold: 5, // min requests before tripping
};

export const decrementBreaker = new CircuitBreaker(
  productClient.decrement,
  options,
);

export const getProductBreaker = new CircuitBreaker(productClient.get, options);

// Log state changes
decrementBreaker.on("open", () => {
  console.log("Circuit OPEN — product-service unreachable");
});

decrementBreaker.on("halfOpen", () => {
  console.log("Circuit HALF-OPEN — testing product-service");
});

decrementBreaker.on("close", () => {
  console.log("Circuit CLOSED — product-service recovered");
});

// Fallback when circuit is open
decrementBreaker.fallback(() => {
  throw new Error("Product service unavailable — circuit open");
});
