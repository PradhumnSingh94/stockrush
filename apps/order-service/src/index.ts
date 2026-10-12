import "express-async-error";
import express from "express";
import { config } from "./config";
import { errorHandler } from "./middleware/error-handler";
import { orderRouter } from "./routes/order.routes";
import { correlationMiddleware } from "./middleware/correlation";
import { registry } from "@stockrush/shared";
import { startOutboxWorker } from "./jobs/outbox.job";
import { startRecoveryWorker } from "./jobs/recovery.job";

const app = express();

app.use(express.json());
app.use(correlationMiddleware);
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "order-service" });
});

app.use("/orders", orderRouter);
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.send(await registry.metrics());
});
app.use(errorHandler);

let stopOutbox = (): void => {};
let stopRecovery = (): void => {};

const server = app.listen(config.PORT, () => {
  console.log(`order-service running on port ${config.PORT}`);
  // Start background workers only after the HTTP service has bound successfully.
  stopOutbox = startOutboxWorker();
  stopRecovery = startRecoveryWorker();
});

function shutdown(signal: string): void {
  console.log(`${signal} received; shutting down Order Service`);
  stopOutbox();
  stopRecovery();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
